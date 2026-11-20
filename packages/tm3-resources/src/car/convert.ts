import type { MrDirectory, MrEntry } from "@tm4/resources/compatibility/mr";
import { validateCarMr } from "@tm4/resources/mods/car-display";
import { directory, writeMr } from "@tm4/resources/mods/mr-writer";

import { at, requireValue } from "../shared/binary.ts";
import { readCar } from "./index.ts";
import type { CarFace, CarModel } from "./model.ts";
import type { CarParameters } from "./parameters.ts";
import { carShadow } from "./shadow.ts";
const wheels: Record<number, string> = {
  0: "fl_wheel",
  1: "fr_wheel",
  2: "rl_wheel",
  3: "rr_wheel",
};
const direct = {
  massBottom: "mass_bottom",
  massTop: "mass_top",
  idleAxleTorque: "idle_axle_torque",
  maxAxleTorque: "maximum_axle_torque",
  engineAxleFric: "engine_axle_friction",
  wheelAxleFricTorque: "wheel_axle_friction_torque",
  maxBrakeKineticTorque: "maximum_brake_kinetic_torque",
  turboEngineMultiplier: "turbo_engine_multiplier_q12",
  damageGiveFactor: "collision_damage_dealt_q12",
  damageReceiveFactor: "collision_damage_received_q12",
} as const;
function integer(value: number, bits = 16) {
  requireValue(
    Number.isInteger(value) && value >= -(2 ** (bits - 1)) && value < 2 ** (bits - 1),
    `Value outside signed ${bits}-bit range: ${value}`,
  );
  return value;
}
// Preserve the reference converter's nearest-even rounding, including negative ties.
function round(value: number) {
  const low = Math.floor(value),
    fraction = value - low;
  return fraction === 0.5 ? low + (low % 2 === 0 ? 0 : 1) : Math.round(value);
}
function scaled(point: number[], scale: number) {
  return point.slice(0, 3).map((v) => integer(round(v * scale)));
}
// TM3 renderer (0x800240b0) adds a half-turn and reverses spin on right wheels.
// Bake that proper Y rotation into their local geometry for TM4's common wheel transform.
function wheelPoint(point: number[], scale: number, slot: number) {
  const right = slot === 1 || slot === 3;
  return scaled(
    point.map((value, axis) => (right && axis !== 1 ? -value : value)),
    scale,
  );
}
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    bytes.set(part, cursor);
    cursor += part.length;
  }
  return bytes;
}
function shorts(values: number[], signed = true) {
  const bytes = new Uint8Array(values.length * 2),
    view = new DataView(bytes.buffer);
  values.forEach((value, i) => {
    if (signed) view.setInt16(i * 2, integer(value), true);
    else {
      requireValue(
        Number.isInteger(value) && value >= 0 && value <= 65535,
        "Invalid unsigned word",
      );
      view.setUint16(i * 2, value, true);
    }
  });
  return bytes;
}
function word(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, integer(value, 32), true);
  return bytes;
}
function put(root: MrDirectory, path: string, bytes: Uint8Array, type = 3, arraySize = 65535) {
  const parts = path.split("/"),
    name = parts.pop()!;
  let node = root;
  for (const part of parts) {
    if (!node.folders.has(part)) node.folders.set(part, directory());
    node = node.folders.get(part)!;
  }
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
  padded.set(bytes);
  node.files.set(name, { type, arraySize, bytes: padded } satisfies MrEntry);
}
function number(root: MrDirectory, path: string, value: number, type = 4) {
  put(root, path, word(value), type);
}
function text(root: MrDirectory, path: string, value: string) {
  put(root, path, new TextEncoder().encode(value + "\0"), 2);
}
/** Sparse reflection strengths by source LOD and face index; omitted faces stay matte. */
export type CarReflections = readonly ReadonlyMap<number, number>[];

export interface CarConversionOptions {
  reflections?: CarReflections;
}

interface Item {
  face: CarFace;
  reflection: number;
  points: number[][];
  normals: number[][];
}
interface Chunk {
  faces: Uint8Array[];
  vertices: number[][];
  normals: number[][];
}
export interface ConvertedGroup {
  name: string;
  source_group: number;
  association: number;
  source_center: number[];
  converted_pivot: number[];
  custom_vertices_in_body_space: boolean;
}
const creaseCosine = Math.cos((75 * Math.PI) / 180);

function triangleNormal(p: number[], q: number[], r: number[]) {
  const a = q.map((v, i) => v - at(p, i));
  const b = r.map((v, i) => v - at(p, i));
  const n = [
    at(a, 1) * at(b, 2) - at(a, 2) * at(b, 1),
    at(a, 2) * at(b, 0) - at(a, 0) * at(b, 2),
    at(a, 0) * at(b, 1) - at(a, 1) * at(b, 0),
  ];
  const length = Math.hypot(...n);
  return length ? n.map((v) => v / length) : null;
}

function shadeSurface(items: Item[]) {
  const adjacent = new Map<string, number[][]>();
  const normals = items.map(({ face, points }) => {
    if (!face.rendered) return null;
    const n =
      triangleNormal(at(points, 0), at(points, 1), at(points, 2)) ??
      (points.length === 4 ? triangleNormal(at(points, 1), at(points, 3), at(points, 2)) : null);
    if (n) {
      for (const key of new Set(points.map((p) => p.join(",")))) {
        const neighbors = adjacent.get(key);
        if (neighbors) neighbors.push(n);
        else adjacent.set(key, [n]);
      }
    }
    return n;
  });
  for (const [i, item] of items.entries()) {
    const n = normals[i];
    item.normals = item.points.map((point) => {
      if (!n) return [0, 0, 0];
      const sum = [0, 0, 0];
      const neighbors = adjacent.get(point.join(","));
      requireValue(neighbors, "Missing incident face");
      for (const other of neighbors) {
        const dot = at(n, 0) * at(other, 0) + at(n, 1) * at(other, 1) + at(n, 2) * at(other, 2);
        if (dot >= creaseCosine)
          for (const axis of [0, 1, 2]) sum[axis] = at(sum, axis) + at(other, axis);
      }
      const length = Math.hypot(...sum);
      return sum.map((v) => round((v * 4096) / length));
    });
  }
}
function equal(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === at(b, i));
}
function index(list: number[][], item: number[]) {
  const found = list.findIndex((value) => equal(value, item));
  return found < 0 ? list.push(item) - 1 : found;
}
function padVertices(vertices: number[][]) {
  while (vertices.length % 3) vertices.push(at(vertices, vertices.length - 1));
}
function encode(items: Item[]): Chunk {
  const result: Chunk = { faces: [], vertices: [], normals: [] };
  for (const { face, points, normals, reflection } of items) {
    const vi: number[] = [],
      ni: number[] = [];
    for (const [corner, point] of points.entries()) {
      const v = index(result.vertices, point);
      vi.push(v);
      ni.push(index(result.normals, [...at(normals, corner), v]));
    }
    if (points.length === 3) {
      vi.push(at(vi, 2));
      ni.push(at(ni, 2));
    }
    const uv = face.uv;
    result.faces.push(
      concat([
        new Uint8Array([face.command & 0x7f, face.command & 0x80 ? 1 : 0, reflection, 0]),
        new Uint8Array(at(uv, 0)),
        shorts([face.clut], false),
        new Uint8Array(at(uv, 1)),
        shorts([face.page], false),
        new Uint8Array([...at(uv, 2), ...at(uv, 3), ...vi, ...ni]),
      ]),
    );
  }
  padVertices(result.vertices);
  return result;
}
function fits(chunk: Chunk) {
  return (
    chunk.vertices.length * 4 + chunk.normals.length * 6 <= 800 &&
    chunk.vertices.length <= 255 &&
    chunk.normals.length <= 255
  );
}
function chunks(items: Item[]) {
  const result: Chunk[] = [];
  let pending: Item[] = [];
  for (const item of items) {
    if (!fits(encode([...pending, item]))) {
      requireValue(pending.length, "Single face exceeds renderer capacity");
      result.push(encode(pending));
      pending = [item];
    } else pending.push(item);
  }
  if (pending.length) result.push(encode(pending));
  return result;
}
function geometry(
  root: MrDirectory,
  meshes: CarModel[],
  scale: number,
  reflections?: CarReflections,
) {
  const allFaces: Uint8Array[] = [],
    allVertices: number[][] = [],
    allNormals: number[][] = [];
  const mapping: ConvertedGroup[][] = [];
  for (const [lod, mesh] of meshes.entries()) {
    const path = `display/resolution/r${lod}/`,
      expanded: number[][] = [],
      detail: ConvertedGroup[] = [];
    const firstFace = allFaces.length;
    const surfaces = new Map<string, Item[]>();
    const prepared = mesh.groups.map((group, gi) => {
      const slot = group.transform_slot,
        wheel = Object.hasOwn(wheels, slot);
      let sourceCenter = group.center;
      if (!group.flag) {
        const [, , start, count] = at(group.frames, 0);
        if (count)
          sourceCenter = [0, 1, 2].map((axis) =>
            Math.trunc(
              mesh.vertices.slice(start, start + count).reduce((sum, p) => sum + at(p, axis), 0) /
                count,
            ),
          );
      }
      const center = scaled(sourceCenter, scale);
      const frames = group.frames.map(([first, count, start, vertexCount], frame) => {
        const items = mesh.faces.slice(first, first + count).map((face, index) => {
          const corners = (face.command & 0x7f) === 0x24 ? 3 : 4;
          let points = face.indices
            .slice(0, corners)
            .map((i) => wheelPoint(at(mesh.vertices, start + i), scale, slot));
          // The selector also drives visibility. Only flagged groups store pivot-relative vertices.
          if (group.flag && !wheel && slot >= 4)
            points = points.map((p) => p.map((v, i) => integer(v + at(center, i))));
          return {
            face,
            points,
            normals: [] as number[][],
            reflection: reflections?.[lod]?.get(first + index) ?? 0,
          };
        });
        // Stationary body panels share seams; independently transformed parts do not.
        const key = frame + ":" + (slot < 0 ? "body" : gi);
        const surface = surfaces.get(key);
        if (surface) surface.push(...items);
        else surfaces.set(key, [...items]);
        return { items, start, vertexCount };
      });
      return { slot, wheel, sourceCenter, center, frames };
    });
    for (const surface of surfaces.values()) shadeSurface(surface);
    for (const [gi, group] of prepared.entries()) {
      const { slot, wheel, sourceCenter, center } = group;
      const frames = group.frames.map(({ items, start, vertexCount }) => {
        const parts = chunks(items);
        if (wheel && vertexCount) {
          // Preserve wheel extents that physics measures, even when no face uses their vertices.
          const original = mesh.vertices
            .slice(start, start + vertexCount)
            .map((p) => wheelPoint(p, scale, slot));
          const extremes = [0, 1, 2].flatMap((axis) => [
            original.reduce((a, b) => (at(a, axis) <= at(b, axis) ? a : b)),
            original.reduce((a, b) => (at(a, axis) >= at(b, axis) ? a : b)),
          ]);
          for (const part of parts) {
            for (const point of extremes) index(part.vertices, point);
            padVertices(part.vertices);
            requireValue(fits(part), "Wheel extents exceed renderer capacity after splitting");
          }
        }
        return parts;
      });
      const ids: number[] = [];
      for (let part = 0; part < Math.max(1, ...frames.map((frame) => frame.length)); ++part) {
        const key = detail.length;
        requireValue(key < 128, "Split model exceeds signed group sort-key capacity");
        const prefix = wheel
          ? at(wheels, slot)
          : slot >= 4
            ? `tm3_part${String(slot).padStart(2, "0")}`
            : "body";
        const name = `${prefix}_g${String(gi).padStart(3, "0")}_c${String(part).padStart(2, "0")}`;
        const ranges: number[] = [];
        for (const frame of frames) {
          // Damage states split independently. TM4 pairs their ranges in one group;
          // a state with fewer chunks has an empty range for the remaining parts.
          const chunk =
            part < frame.length ? at(frame, part) : { faces: [], vertices: [], normals: [] };
          ranges.push(
            allFaces.length,
            chunk.faces.length,
            allVertices.length,
            chunk.vertices.length,
            allNormals.length,
            chunk.normals.length,
          );
          allFaces.push(...chunk.faces);
          allVertices.push(...chunk.vertices);
          allNormals.push(...chunk.normals);
        }
        put(
          root,
          path + "Groups/" + name,
          concat([shorts([...ranges, ...center]), new Uint8Array([wheel ? 1 : 0, key])]),
        );
        ids.push(key);
        detail.push({
          name,
          source_group: gi,
          association: slot,
          source_center: sourceCenter,
          converted_pivot: center,
          custom_vertices_in_body_space: slot >= 4,
        });
      }
      expanded.push(ids);
    }
    const views: number[] = [];
    for (const order of mesh.orders) {
      const selected = order.flatMap((group) => at(expanded, group));
      requireValue(selected.length <= 255, "Too many selected groups");
      views.push(
        selected.length,
        ...selected,
        ...Array<number>(detail.length - selected.length).fill(0),
      );
    }
    put(root, path + "viewtable", new Uint8Array(views));
    number(root, path + "NumGroups", detail.length);
    number(root, path + "NumFaces", allFaces.length - firstFace);
    if (lod < 2) number(root, path + "maxDistanceToDisplay", round(at([2048, 8192], lod) * scale));
    mapping.push(detail);
  }
  put(root, "display/resolution/FaceList", concat(allFaces));
  put(root, "display/resolution/VertexList", concat(allVertices.map((p) => shorts([...p, 0]))));
  put(root, "display/resolution/VertexNormalList", concat(allNormals.map((p) => shorts(p))));
  for (const [name, value] of Object.entries({
    NumFaces: allFaces.length,
    NumVertices: allVertices.length,
    NumVertexNormals: allNormals.length,
    NumGroups: mapping.reduce((sum, groups) => sum + groups.length, 0),
  }))
    number(root, "display/resolution/" + name, value);
  return mapping;
}
function tuning(root: MrDirectory, params: CarParameters) {
  const values: Record<string, number> = Object.fromEntries(
    Object.entries(direct).map(([key, field]) => [key, at(params, field)]),
  );
  ["R", "N", "1", "2", "3", "4"].forEach((name, i) => {
    values["gearRadius" + name] = at(params.gear_radius, i);
  });
  integer(at(values, "massBottom"));
  integer(at(values, "massTop"));
  values.frictionAdvantageFront = params.surface_friction_adjustment;
  values.frictionAdvantageBack = params.surface_friction_adjustment;
  for (const [key, value] of Object.entries(values)) number(root, "physics/" + key, value, 13);
  const drive = new Map([
    [0, "four wheel"],
    [1, "front wheel"],
    [-1, "back wheel"],
  ]).get(params.drivetrain);
  requireValue(drive, "Unsupported drivetrain value");
  text(root, "physics/wheelDrive", drive);
  put(root, "radarDotColor", new Uint8Array([...params.radar_color, 0]), 14);
  const health = params.health_by_control_and_difficulty.slice(3, 6);
  requireValue(new Set(health).size === 1, "Expected equal player health at every difficulty");
  number(root, "healthEnergyMax", at(health, 0));
}
function bounds(mesh: CarModel, params: CarParameters, scale: number) {
  const points = mesh.groups.flatMap((group) => {
    const [, , first, count] = at(group.frames, 0);
    return mesh.vertices
      .slice(first, first + count)
      .map((p) => p.slice(0, 3).map((v, i) => v + (group.flag ? at(group.center, i) : 0)));
  });
  requireValue(points.length, "No detailed geometry bounds");
  const low = [0, 1, 2].map((i) => Math.min(...points.map((p) => at(p, i))));
  const high = [0, 1, 2].map((i) => Math.max(...points.map((p) => at(p, i))));
  low[1] = Math.floor((at(low, 1) * params.bounds_y_min_scale_q12 + 2048) / 4096);
  for (const [axis, factor] of [
    [0, params.bounds_x_scale_adjustment_q12],
    [2, params.bounds_z_scale_adjustment_q12],
  ] as const) {
    for (const bound of [low, high]) {
      const half = Math.trunc((at(bound, axis) * (4096 + factor)) / 2);
      bound[axis] = Math.floor((half + 2048) / 4096);
    }
  }
  return [scaled(low, scale), scaled(high, scale)];
}
/** Resource conversion only: behavior and game-policy choices remain in the mod. */
export async function convertCar(
  source: Uint8Array<ArrayBuffer>,
  scale = 1,
  options: CarConversionOptions = {},
) {
  requireValue(Number.isFinite(scale) && scale > 0, "Scale must be finite and positive");
  const car = readCar(source),
    root = directory();
  const { reflections } = options;
  if (reflections) {
    requireValue(reflections.length === car.models.length, "Reflections must specify every LOD");
    for (const [lod, model] of car.models.entries()) {
      for (const [face, value] of at(reflections, lod)) {
        requireValue(
          Number.isInteger(face) && face >= 0 && face < model.faces.length,
          `Reflection face outside source r${lod}: ${face}`,
        );
        requireValue(
          Number.isInteger(value) && value >= 0 && value <= 255,
          `Reflection outside byte range at r${lod}/${face}: ${value}`,
        );
      }
    }
  }
  const groups = geometry(root, car.models, scale, reflections);
  tuning(root, car.parameters);
  const box = bounds(at(car.models, 0), car.parameters, scale);
  for (const [axis, key] of ["physicsBoxWidth", "physicsBoxHeight", "physicsBoxLength"].entries()) {
    const extent = integer(at(at(box, 1), axis) - at(at(box, 0), axis));
    requireValue(extent > 0, "Empty physics box dimension");
    number(root, "physics/" + key, extent);
  }
  const shadow = carShadow(car.texture, car.models);
  const { x, y, width } = car.texture;
  put(
    root,
    "display/car.bit",
    concat([shorts([x, y, width, shadow.height]), shorts(shadow.words, false)]),
  );
  put(
    root,
    "display/shadow",
    concat([
      new Uint8Array([shadow.u, shadow.v]),
      shorts([shadow.clut], false),
      new Uint8Array([shadow.lastU, shadow.lastV]),
      shorts([shadow.page], false),
    ]),
  );
  const mounts = at(car.models, 0).anchors_raw.map((p) =>
    concat([shorts([...scaled(p, scale), 0]), shorts([0, 0, 4096, 0])]),
  );
  put(root, "machineGuns", concat(mounts.slice(0, 2)), 26, 2);
  put(root, "tm3SpecialMount", at(mounts, 2), 26, 1);
  const archive = writeMr(root),
    validation = await validateCarMr(archive, { strictAssociations: true });
  requireValue(
    validation.errors.length === 0,
    "Converted car failed validation: " + validation.errors.join("; "),
  );
  const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  const metadata = {
    source_sha256: [...sha].map((v) => v.toString(16).padStart(2, "0")).join(""),
    scale,
    groups,
    undrawn_faces: car.models.flatMap((model, lod) =>
      model.faces.flatMap((face, index) =>
        !face.rendered && !model.unreferenced_faces.includes(index)
          ? [{ lod, index, command: face.command, color: face.color_raw, indices: face.indices }]
          : [],
      ),
    ),
    parameters: car.parameters,
    source_physics_box: box,
    validation,
    limitations: [
      "Resource only; no behavior, sound registration, UI card or mod manifest.",
      "Generated TM4-style corner normals; source RGB tint is not represented in TM4 faces.",
      "Custom parts are frozen in body space; source pivots/associations are recorded.",
      "Physics box dimensions are converted; TM4 centers X/Z and keeps its own Y maximum.",
      "AI and missing physics settings use TM4 class defaults.",
      "Mount directions are authored forward Q12, not recovered from TM3 positions.",
    ],
  };
  return { root, archive, metadata, specialVab: car.specialVab };
}
