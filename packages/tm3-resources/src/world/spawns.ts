import { at, Binary, requireValue } from "../shared/binary.ts";
import type { Terrain, TerrainCollision } from "./terrain.ts";

// Vertical specialization of the engine's polygon ray test. Preserve the Q12
// segment fraction: rounding the plane height directly gives different spawn Y.
function height(polygon: TerrainCollision, x: number, z: number) {
  const [nx, ny, nz] = polygon.normal_raw.map(BigInt);
  if (ny! >= 0n) return undefined;
  const first = at(polygon.vertices_raw, 0);
  const denominator = 32768n * ny!;
  const numerator =
    BigInt(first[0]! - x) * nx! + BigInt(first[1]! + 16384) * ny! + BigInt(first[2]! - z) * nz!;
  if (numerator > 0n || numerator < denominator) return undefined;
  for (let i = 0; i < first[3]!; ++i) {
    const vertex = at(polygon.vertices_raw, i),
      edge = at(polygon.edge_vectors_raw, i);
    if ((z - vertex[2]!) * edge[0]! - (x - vertex[0]!) * edge[2]! < 0) return undefined;
  }
  return -16384 + Number((numerator * 4096n) / denominator) * 8;
}

/** Bake TM3's ground-minus-96 placement into ordinary TM4 startpoints. */
export function convertStartpoints(terrain: Terrain, records: Uint8Array, groups: Uint8Array) {
  const changing = new Set<number>();
  const stages = new Binary(groups);
  for (let base = 0; base < groups.length; base += 316) {
    for (let stage = 0; stage < stages.u8(base); ++stage) {
      const offset = base + 8 + stage * 72;
      const first = stages.u32(offset + 64),
        count = stages.u32(offset + 68);
      for (let i = first; i < first + count; ++i) changing.add(i);
    }
  }
  const source = new DataView(records.buffer, records.byteOffset, records.byteLength);
  const result: Uint8Array[] = [];
  for (let offset = 0; offset < records.length; offset += 16) {
    const x = source.getInt16(offset, true),
      z = source.getInt16(offset + 4, true);
    if (!x && !z) continue; // TM3 ignores unused entries, even if other fields are nonzero.
    const square = at(terrain.grid, ((z >> 10) + 32) * 64 + (x >> 10) + 32);
    requireValue(square !== 65535, `Spawn ${offset / 16}: outside world grid`);
    const [first, count] = at(terrain.square_collision_ranges, square);
    let ground: number | undefined;
    let stable: number | undefined;
    for (let i = first!; i < first! + count!; ++i) {
      const id = at(terrain.collision_indices, i),
        polygon = at(terrain.collisions, id);
      const y = height(polygon, x, z);
      if (y === undefined) continue;
      // Inspect disabled stages too: enabling geometry above the floor would
      // make a static startpoint differ from TM3's runtime query.
      ground = ground === undefined ? y : Math.min(ground, y);
      if (
        !changing.has(id) &&
        at(at(polygon.vertices_raw, 2), 3) < 0 &&
        at(at(polygon.edge_vectors_raw, 0), 3)
      )
        stable = stable === undefined ? y : Math.min(stable, y);
    }
    requireValue(
      ground !== undefined && ground === stable,
      `Spawn ${offset / 16}: no permanent topmost floor; cannot bake height`,
    );
    requireValue(ground - 96 >= -32768, `Spawn ${offset / 16}: height outside int16`);
    const point = new Uint8Array(records.subarray(offset, offset + 16));
    const view = new DataView(point.buffer);
    view.setInt16(2, ground - 96, true);
    view.setInt16(6, 0, true);
    view.setInt16(14, 0, true);
    result.push(point);
  }
  requireValue(result.length > 0, "Map has no active spawn points");
  const bytes = new Uint8Array(result.length * 16);
  result.forEach((point, index) => bytes.set(point, index * 16));
  return bytes;
}
