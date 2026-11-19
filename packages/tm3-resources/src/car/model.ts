import { Binary, requireValue } from "../shared/binary.ts";
export interface CarFace {
  color_raw: number[];
  command: number;
  rendered: boolean;
  // Raw texture slots; unused for an untextured 0x28 record.
  uv: number[][];
  clut: number;
  page: number;
  indices: number[];
}
export interface CarGroup {
  frames: [number, number, number, number][];
  center: number[];
  flag: number;
  transform_slot: number;
}
export interface CarModel {
  anchors_raw: number[][];
  groups: CarGroup[];
  faces: CarFace[];
  vertices: number[][];
  unreferenced_faces: number[];
  word_after_vertices: number;
  orders: number[][];
  order_unused_hex: string[];
  trailing_hex: string;
}
export function readModel(bytes: Uint8Array): CarModel {
  const data = new Binary(bytes),
    geometry = data.u32(0),
    order = data.u32(4);
  requireValue(geometry === 8 && order >= 44 && order <= bytes.length, "Unsupported model header");
  const groups = data.u32(8),
    faces = data.u32(12),
    vertices = data.u32(16);
  const faceStart = 44 + groups * 24,
    vertexStart = faceStart + faces * 20;
  requireValue(vertexStart + vertices * 8 + 4 === order, "Model sections do not meet order table");
  const result: CarModel = {
    anchors_raw: Array.from({ length: 3 }, (_, i) => data.shorts(20 + i * 8, 4)),
    groups: [],
    faces: [],
    vertices: [],
    unreferenced_faces: [],
    word_after_vertices: 0,
    orders: [],
    order_unused_hex: [],
    trailing_hex: "",
  };
  const referenced = new Set<number>();
  for (let i = 0; i < groups; ++i) {
    const offset = 44 + i * 24;
    const frames: CarGroup["frames"] = [0, 8].map((frame) => [
      data.i16(offset + frame),
      data.i16(offset + frame + 2),
      data.i16(offset + frame + 4),
      data.i16(offset + frame + 6),
    ]);
    for (const [first, count, start, length] of frames) {
      requireValue(
        Math.min(first, count, start, length) >= 0 &&
          first + count <= faces &&
          start + length <= vertices,
        "Invalid group range",
      );
      for (let j = first; j < first + count; ++j) referenced.add(j);
    }
    result.groups.push({
      frames,
      center: data.shorts(offset + 16, 3),
      flag: data.u8(offset + 22),
      transform_slot: data.i8(offset + 23),
    });
  }
  for (let i = 0; i < faces; ++i) {
    const offset = faceStart + i * 20,
      command = data.u8(offset + 3);
    requireValue(
      !referenced.has(i) || [0x24, 0x28, 0x2c].includes(command & 0x7f),
      `Unsupported referenced face ${i} command 0x${command.toString(16)}`,
    );
    result.faces.push({
      color_raw: [...bytes.slice(offset, offset + 3)],
      command,
      // All three original car render paths dispatch only FT3/FT4. The F4
      // records in FIRE remain in the model but produce no draw packet.
      rendered: [0x24, 0x2c].includes(command & 0x7f),
      uv: [4, 8, 12, 14].map((j) => [...bytes.slice(offset + j, offset + j + 2)]),
      clut: data.u16(offset + 6),
      page: data.u16(offset + 10),
      indices: [...bytes.slice(offset + 16, offset + 20)],
    });
    if (!referenced.has(i)) result.unreferenced_faces.push(i);
  }
  result.vertices = Array.from({ length: vertices }, (_, i) => data.shorts(vertexStart + i * 8, 4));
  for (const group of result.groups)
    for (const [first, count, , length] of group.frames)
      for (const face of result.faces.slice(first, first + count)) {
        const corners = (face.command & 0x7f) === 0x24 ? 3 : 4;
        requireValue(
          face.indices.slice(0, corners).every((index) => index < length),
          "Face index outside group vertex range",
        );
      }
  result.word_after_vertices = data.u32(vertexStart + vertices * 8);
  let cursor = order;
  for (let i = 0; i < 16; ++i) {
    requireValue(cursor + groups + 1 <= bytes.length, "Missing order slot");
    const count = data.u8(cursor);
    requireValue(count <= groups, "Order count exceeds fixed slot");
    const values = [...bytes.slice(cursor + 1, cursor + 1 + count)];
    requireValue(
      values.every((value) => value < groups),
      "Invalid order list",
    );
    result.orders.push(values);
    result.order_unused_hex.push(data.hex(cursor + 1 + count, cursor + 1 + groups));
    cursor += 1 + groups;
  }
  result.trailing_hex = data.hex(cursor, bytes.length);
  requireValue(
    bytes.length - cursor <= 4 && bytes.slice(cursor).every((v) => v === 0),
    "Unknown model tail",
  );
  return result;
}
