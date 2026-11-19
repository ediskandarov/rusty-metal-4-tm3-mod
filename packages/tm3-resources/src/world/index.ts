import { at, Binary, readBlocks, requireValue } from "../shared/binary.ts";
import { readTerrain } from "./terrain.ts";
import { WorldVram } from "./textures.ts";

export function readWorld(ter: Uint8Array, img: Uint8Array) {
  const blocks = readBlocks(ter, 8, true);
  const ai = at(blocks, 3).bytes;
  requireValue(
    new TextDecoder().decode(ai.slice(0, 8)) === "AI DATA\0",
    "Missing AI block signature",
  );
  return { blocks, terrain: readTerrain(at(blocks, 0).bytes), vram: new WorldVram(img) };
}
export type WorldResources = ReturnType<typeof readWorld>;
export interface WorldView {
  detail?: 0 | 1;
  textureVariant?: 0 | 1;
  includeDisabled?: boolean;
}
export interface WorldPolygon {
  square: number;
  face: number;
  points: number[][];
  colors: number[][];
  uv: number[][];
  clut: number;
  page: number;
}

/** Select one detail group and texture variant; do not concatenate alternative geometry. */
export function* worldPolygons(
  world: WorldResources,
  options: WorldView = {},
): Generator<WorldPolygon> {
  const detail = options.detail ?? 0,
    variant = options.textureVariant ?? 0;
  requireValue([0, 1].includes(detail) && [0, 1].includes(variant), "Invalid world view");
  const data = new Binary(at(world.blocks, 0).bytes);
  for (const [square, groups] of world.terrain.squares.entries()) {
    const group = at(groups, detail);
    for (const offset of group.faces) {
      const face = at(world.terrain.faces, offset);
      if (!options.includeDisabled && !face.enabled_raw) continue;
      const count = face.command & 8 ? 4 : 3,
        texture = face.texture + variant * 12;
      yield {
        square,
        face: offset,
        points: face.indices
          .slice(0, count)
          .map((index) => at(world.terrain.vertices, group.first_vertex + index).slice(0, 3)),
        colors: face.colors.slice(0, count),
        uv: [0, 4, 8, 10]
          .slice(0, count)
          .map((offset) => [data.u8(texture + offset), data.u8(texture + offset + 1)]),
        clut: data.u16(texture + 2),
        page: data.u16(texture + 6),
      };
    }
  }
}

/** Check every referenced pixel, including disabled faces, for both detail groups and UV variants. */
export function validateWorldTextures(world: WorldResources) {
  const results = [];
  for (const detail of [0, 1] as const)
    for (const textureVariant of [0, 1] as const) {
      const seen = new Set<string>();
      let faces = 0;
      for (const polygon of worldPolygons(world, {
        detail,
        textureVariant,
        includeDisabled: true,
      })) {
        ++faces;
        const u0 = Math.min(...polygon.uv.map((uv) => at(uv, 0))),
          v0 = Math.min(...polygon.uv.map((uv) => at(uv, 1)));
        const u1 = Math.max(...polygon.uv.map((uv) => at(uv, 0))),
          v1 = Math.max(...polygon.uv.map((uv) => at(uv, 1)));
        const key = [polygon.page, polygon.clut, u0, v0, u1, v1].join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        for (let v = v0; v <= v1; ++v)
          for (let u = u0; u <= u1; ++u) world.vram.sample(polygon.page, polygon.clut, u, v);
      }
      results.push({
        detail,
        texture_variant: textureVariant,
        referenced_faces_including_disabled: faces,
        textures: seen.size,
      });
    }
  return results;
}
