import { binary, directory, stringEntry } from "@tm4/resources/mods/mr-writer";

import { at, Binary, requireValue } from "../shared/binary.ts";
import type { Terrain, TerrainGroup } from "./terrain.ts";

function words(values: readonly number[], type = 3) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, i) => view.setUint32(i * 4, value, true));
  return { ...binary(bytes), type };
}

// TM4 indexed geometry stores a count and (count, first) for each detail level.
function indexed(first: number[], second: number[]) {
  return words([
    first.length + second.length,
    first.length,
    0,
    second.length,
    first.length,
    ...first,
    ...second,
  ]);
}

export function convertDestroyables(
  terrain: Terrain,
  groups: Binary,
  faceOffsets: Binary,
  buildTransition?: (stage: Binary, group: number, name: string) => void,
) {
  const startup = directory();
  const count = groups.bytes.length / 316;
  const faceOwners = new Map<number, { detail: number; group: TerrainGroup }[]>();
  for (const square of terrain.squares) {
    for (const [detail, group] of square.entries()) {
      for (const offset of group.faces) {
        const owners = faceOwners.get(offset) ?? [];
        owners.push({ detail, group });
        faceOwners.set(offset, owners);
      }
    }
  }

  function writeFaces(instance: ReturnType<typeof directory>, stage: number) {
    const startFace = groups.u32(stage + 56),
      numFaces = groups.u32(stage + 60);
    if (!numFaces) return;
    requireValue(
      startFace + numFaces <= faceOffsets.bytes.length / 4,
      "Destruction stage outside world geometry",
    );
    const faces: [number[], number[]] = [[], []];
    const fragments: number[] = [];
    const vertexBases: [number[], number[]] = [[], []];
    const vertices = [new Set<number>(), new Set<number>()];
    for (let j = 0; j < numFaces; j++) {
      const offset = faceOffsets.u32(4 * (startFace + j));
      const face = at(terrain.faces, offset);
      const owners = faceOwners.get(offset);
      requireValue(owners?.length, "Destruction face has no square");
      if (groups.u8(stage + 4)) {
        const base = at(owners, 0).group.first_vertex;
        requireValue(
          owners.every(({ group }) => group.first_vertex === base),
          "Ambiguous destruction fragment vertex base",
        );
        fragments.push(offset, base);
      }
      for (const { detail, group } of owners) {
        at(faces, detail).push(offset);
        at(vertexBases, detail).push(group.first_vertex);
        for (const corner of face.indices.slice(0, face.command & 8 ? 4 : 3))
          at(vertices, detail).add((group.first_vertex + corner) * 8);
      }
    }

    if (fragments.length) instance.files.set("fragmentFaces", words([numFaces, ...fragments]));
    instance.files.set("displayEmbedded", words([1], 11));
    instance.files.set("displayFaceInfo", indexed(faces[0], faces[1]));
    instance.files.set("displayFaceVertexInfo", words([...vertexBases[0], ...vertexBases[1]]));
    instance.files.set("displayVertexInfo", indexed([...at(vertices, 0)], [...at(vertices, 1)]));
  }

  function writeCollisions(instance: ReturnType<typeof directory>, indices: number[]) {
    if (!indices.length) return;
    const polyOffsets = indices.map((index) => index * 80);
    const collisionVertices = indices.flatMap((index, i) =>
      Array.from(
        { length: at(at(at(terrain.collisions, index).vertices_raw, 0), 3) },
        (_, corner) => at(polyOffsets, i) + 16 + corner * 8,
      ),
    );
    instance.files.set("collideEmbedded", words([1], 11));
    instance.files.set("collisionPolyInfo", words([indices.length, ...polyOffsets]));
    instance.files.set(
      "collisionVertexInfo",
      words([collisionVertices.length, ...collisionVertices]),
    );
  }

  for (let id = 0; id < count; ++id) {
    const base = id * 316,
      length = groups.u8(base);
    if (length < 2 || length > 4 || groups.u8(base + 1) !== 0) continue;
    const initial = directory();
    const aiObject = groups.i16(base + 6);
    if (aiObject >= 0) initial.files.set("aiObject", words([aiObject]));
    let node = initial;
    let supported = true;
    let animation: Binary | undefined;
    for (let index = 0; index < length; ++index) {
      const stage = base + 8 + index * 72;
      const first = groups.u32(stage + 64),
        count = groups.u32(stage + 68);
      requireValue(
        first + count <= terrain.collisions.length,
        "Destruction stage outside world geometry",
      );
      const indices = Array.from({ length: count }, (_, i) => first + i);
      const final = index === length - 1;
      if (!final) {
        const hitPoints = groups.i16(stage);
        const active = indices.filter(
          (i) => at(at(at(terrain.collisions, i).vertices_raw, 2), 3) === id,
        );
        if (groups.u8(stage + 8)) {
          if (
            !buildTransition ||
            index !== length - 2 ||
            groups.u32(stage + 72 + 60) ||
            groups.u32(stage + 72 + 68)
          ) {
            supported = false;
            break;
          }
          animation = new Binary(groups.bytes.subarray(stage, stage + 72));
        }
        if (hitPoints <= 0 || !active.length) {
          supported = false;
          break;
        }
        node.files.set("stageEffect", stringEntry("Tm3StageEffect"));
        node.files.set("stageId", words([id, index]));
        node.files.set("hitPoints", words([hitPoints], 4));
        writeCollisions(node, active);
        if (active.length < indices.length) {
          const passive = directory();
          writeCollisions(
            passive,
            indices.filter((i) => !active.includes(i)),
          );
          node.folders.set("passive", passive);
        }
      } else writeCollisions(node, indices);
      writeFaces(node, stage);
      if (
        !final &&
        (index + 2 < length || groups.u32(stage + 72 + 60) || groups.u32(stage + 72 + 68))
      ) {
        const next = directory();
        node.folders.set("next", next);
        node = next;
      }
    }
    if (!supported) continue;
    const name = `tm3_group_${id}`;
    if (animation && buildTransition) {
      buildTransition(animation, id, name);
      const events = directory();
      const event = directory();
      event.files.set("class", stringEntry("tm3Transition"));
      event.files.set("instance", stringEntry("released/" + name));
      events.folders.set("animation", event);
      initial.folders.set("onDestroy", events);
    }
    startup.folders.set(name, initial);
  }
  return { startup, omitted: count - startup.folders.size };
}
