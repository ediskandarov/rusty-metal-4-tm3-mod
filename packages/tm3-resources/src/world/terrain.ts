import { at, Binary, requireValue } from "../shared/binary.ts";

export interface TerrainSection {
  name: string;
  offset: number;
  size: number;
}
export interface TerrainFace {
  offset: number;
  size: number;
  command: number;
  indices: number[];
  colors: number[][];
  texture: number;
  enabled_raw: number;
}
export interface TerrainGroup {
  first_vertex: number;
  vertex_count: number;
  faces: number[];
}
export interface TerrainCollision {
  normal_raw: number[];
  vertices_raw: number[][];
  edge_vectors_raw: number[][];
}
export interface Terrain {
  sections: TerrainSection[];
  grid: number[];
  squares: TerrainGroup[][];
  faces: Record<number, TerrainFace>;
  vertices: number[][];
  objects: { offset: number; type: number; size: number }[];
  collisions: TerrainCollision[];
  collision_indices: number[];
  square_collision_ranges: number[][];
}

/** Loader stream order from TM3 USA v1.1, 80012eb4. Unknown sections stay raw in the TER block. */
export function readTerrain(bytes: Uint8Array): Terrain {
  const data = new Binary(bytes),
    squareCount = data.u16(0x2810),
    faceCount = data.u16(0x2812),
    vertexCount = data.u32(0x2814);
  const result: Terrain = {
    sections: [],
    grid: [],
    squares: [],
    faces: {},
    vertices: [],
    objects: [],
    collisions: [],
    collision_indices: [],
    square_collision_ranges: [],
  };
  let cursor = 0;
  function section(name: string, size: number) {
    requireValue(size >= 0 && cursor + size <= bytes.length, `Truncated ${name}`);
    const start = cursor;
    cursor += size;
    result.sections.push({ name, offset: start, size });
    return start;
  }
  section("grid", 0x2000);
  section("spawn_records", 0x400);
  section("position_records", 0x400);
  section("unknown_2800", 16);
  section("counts", 44);
  const squares = section("squares", squareCount * 56);
  const textures = section("textures", data.u16(0x281c) * 24);
  const objectBytes = data.u32(0x2824),
    objects = section("objects", objectBytes);
  section("destruction_face_offsets", data.u32(0x282c) * 4);
  section("destruction_groups", data.u32(0x2828) * 316);
  const collisionCount = data.u16(0x281a),
    indexCount = data.u16(0x2818);
  const indices = section("collision_indices", indexCount * 2);
  const collisions = section("collision_records", collisionCount * 76);
  section("animation_records_raw", data.u16(0x2832));
  section("animation_pixels_raw", data.u32(0x2834));
  section("unknown_records_32", data.u16(0x281e) * 32);
  const faces = cursor;
  for (let i = 0; i < faceCount; ++i) {
    const command = data.u8(cursor + 3),
      gouraud = !!(command & 16);
    requireValue(
      [0x24, 0x2c, 0x34, 0x3c].includes(command),
      `Unsupported face at 0x${cursor.toString(16)}`,
    );
    const size = gouraud ? 24 : 16;
    requireValue(cursor + size <= bytes.length, "Truncated face");
    const color = [...bytes.slice(cursor, cursor + 3)];
    const colors = gouraud
      ? [
          color,
          ...[8, 12, 16].map((offset) => [...bytes.slice(cursor + offset, cursor + offset + 3)]),
        ]
      : [color, [...color], [...color], [...color]];
    let texture = data.u32(cursor + size - 4);
    if (texture >= 0x1f800340 && texture < 0x1f800400) texture = textures + texture - 0x1f800340;
    requireValue(
      texture >= textures && texture < objects && (texture - textures) % 24 === 0,
      "Invalid texture reference",
    );
    result.faces[cursor - faces] = {
      offset: cursor,
      size,
      command,
      indices: [...bytes.slice(cursor + 4, cursor + 8)],
      colors,
      texture,
      enabled_raw: data.u8(cursor + (gouraud ? 19 : 10)),
    };
    cursor += size;
  }
  result.sections.push({ name: "faces", offset: faces, size: cursor - faces });
  const vertices = section("vertices", vertexCount * 8);
  section("trailing_records_52", data.u32(0x2838) * 52);
  requireValue(
    bytes.length - cursor === 4 && bytes.slice(cursor).every((value) => value === 0),
    "Unknown terrain tail",
  );
  section("padding", 4);
  result.vertices = Array.from({ length: vertexCount }, (_, i) => data.shorts(vertices + i * 8, 4));
  result.collision_indices = data.shorts(indices, indexCount);
  requireValue(
    result.collision_indices.every((value) => value >= 0 && value < collisionCount),
    "Collision index out of range",
  );
  for (let i = 0; i < collisionCount; ++i) {
    const start = collisions + i * 76;
    const verticesRaw = Array.from({ length: 4 }, (_, j) => data.shorts(start + 12 + j * 8, 4));
    requireValue([3, 4].includes(at(at(verticesRaw, 0), 3)), "Unsupported collision polygon");
    result.collisions.push({
      normal_raw: [0, 4, 8].map((offset) => data.i32(start + offset)),
      vertices_raw: verticesRaw,
      edge_vectors_raw: Array.from({ length: 4 }, (_, j) => data.shorts(start + 44 + j * 8, 4)),
    });
  }
  result.grid = Array.from({ length: 4096 }, (_, i) => data.u16(i * 2));
  requireValue(
    result.grid.every((value) => value === 65535 || value < squareCount),
    "Grid square out of range",
  );
  for (let i = 0; i < squareCount; ++i) {
    const start = squares + i * 56,
      firstCollision = data.u16(start + 10),
      countCollision = data.u8(start + 9);
    requireValue(firstCollision + countCollision <= indexCount, "Square collision range invalid");
    result.square_collision_ranges.push([firstCollision, countCollision]);
    const groups: TerrainGroup[] = [];
    for (let level = 0; level < 2; ++level) {
      const offset = start + 40 + level * 8,
        nv = data.u8(offset),
        nf = data.u8(offset + 1),
        first = data.u16(offset + 2);
      let faceOffset = data.u32(offset + 4);
      requireValue(first + nv <= vertexCount, "Square vertices out of range");
      const selected: number[] = [];
      for (let j = 0; j < nf; ++j) {
        const face = result.faces[faceOffset];
        requireValue(face, "Square face reference is not a face boundary");
        const corners = face.command & 8 ? 4 : 3;
        requireValue(
          face.indices.slice(0, corners).every((value) => value < nv),
          "Local vertex out of range",
        );
        selected.push(faceOffset);
        faceOffset += face.size;
      }
      groups.push({ first_vertex: first, vertex_count: nv, faces: selected });
    }
    result.squares.push(groups);
  }
  cursor = objects;
  for (let i = 0; i < data.u32(0x2820); ++i) {
    requireValue(cursor + 12 <= objects + objectBytes, "Invalid object extent");
    const size = data.u16(cursor + 10);
    requireValue(size >= 12 && cursor + size <= objects + objectBytes, "Invalid object extent");
    result.objects.push({ offset: cursor, type: data.u8(cursor), size });
    cursor += size;
  }
  requireValue(cursor === objects + objectBytes, "Object stream length mismatch");
  return result;
}
