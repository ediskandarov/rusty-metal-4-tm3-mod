import type { MrDirectory } from "@tm4/resources/compatibility/mr";

import { at, Binary, requireValue } from "../shared/binary.ts";
import { pickupTypes } from "./pickups.ts";

// US v1.1 loader 80048888, constructor 8002bda8 and renderer 80029ff4.
// Ground models use G3/G4 vertex colours. The textured projectiles live in block 7.
export function readPickupModels(bytes: Uint8Array) {
  if (!bytes.length) return [];
  const data = new Binary(bytes);
  const faceBase = 0x9c,
    faceCount = data.u32(0x88),
    vertexCount = data.u32(0x8c);
  const vertexBase = faceBase + 20 * faceCount;
  requireValue(vertexBase + 8 * vertexCount <= bytes.length, "Truncated pickup model streams");
  return pickupTypes.map((type, i) => {
    const record = i * 8;
    const vertices = data.u8(record),
      faces = data.u8(record + 1);
    const firstVertex = data.u16(record + 2),
      faceOffset = data.u32(record + 4);
    requireValue(
      faceOffset % 20 === 0 &&
        faceOffset / 20 + faces <= faceCount &&
        firstVertex + vertices <= vertexCount,
      "Pickup model range outside streams",
    );
    const faceBytes = bytes.subarray(faceBase + faceOffset, faceBase + faceOffset + faces * 20);
    for (let j = 0; j < faces; j++) {
      const cmd = at(faceBytes, j * 20 + 3);
      requireValue(cmd === 0x30 || cmd === 0x38, "Unsupported pickup face command");
      const corners = cmd === 0x38 ? 4 : 3;
      for (let k = 0; k < corners; k++)
        requireValue(at(faceBytes, j * 20 + 4 + k) < vertices, "Pickup face vertex outside group");
    }
    // Local, pointer-free PowerModelPart followed by its own face and vertex streams.
    const mesh = new Uint8Array(8 + faces * 20 + vertices * 8);
    mesh.set([vertices, faces]);
    mesh.set(faceBytes, 8);
    const start = vertexBase + firstVertex * 8;
    mesh.set(bytes.subarray(start, start + vertices * 8), 8 + faceBytes.length);
    return {
      name: type.name,
      type: type.tm4Type ?? type.name.toLowerCase(),
      mesh,
    };
  });
}

// Stock TM4 PowerModelFile: 19 parts, counts, two relocated pointers and one spare word.
// Its class constructor computes normals through PsyQ, just as for original pickups.
export function convertPickupModels(
  bytes: Uint8Array,
  defaults: MrDirectory,
  mapWeapon: string | undefined,
) {
  const source = defaults.files.get("power.bin")?.bytes;
  requireValue(source, "Missing TM4 power.bin");
  const data = new Binary(source);
  const faceCount = data.u32(0x98),
    vertexCount = data.u32(0x9c);
  const vertexBase = 0xac + faceCount * 20;
  requireValue(vertexBase + vertexCount * 8 === source.length, "Invalid TM4 power.bin streams");
  const parts = Array.from({ length: 19 }, (_, index) => {
    const offset = index * 8;
    const vertices = data.u8(offset),
      faces = data.u8(offset + 1);
    const first = data.u16(offset + 2),
      faceOffset = data.u32(offset + 4);
    requireValue(
      faceOffset % 20 === 0 &&
        faceOffset / 20 + faces <= faceCount &&
        first + vertices <= vertexCount,
      "TM4 pickup model range outside streams",
    );
    const mesh = new Uint8Array(8 + faces * 20 + vertices * 8);
    mesh.set([vertices, faces]);
    mesh.set(source.subarray(0xac + faceOffset, 0xac + faceOffset + faces * 20), 8);
    mesh.set(
      source.subarray(vertexBase + first * 8, vertexBase + (first + vertices) * 8),
      8 + faces * 20,
    );
    return mesh;
  });
  const replaced = new Set<number>();
  for (const { name, type, mesh } of readPickupModels(bytes)) {
    if (type === "inactive" || (type === "proximity" && name !== mapWeapon)) continue;
    const entry = defaults.folders.get(type)?.files.get("geometryIndex");
    requireValue(entry?.bytes.length === 4, `Missing TM4 pickup geometryIndex: ${type}`);
    const index = new Binary(entry.bytes).u32(0);
    requireValue(
      index < parts.length && !replaced.has(index),
      `Conflicting TM4 pickup slot: ${type}`,
    );
    parts[index] = mesh;
    replaced.add(index);
  }
  let faces = 0,
    vertices = 0;
  for (const part of parts) {
    vertices += part[0]!;
    faces += part[1]!;
  }
  requireValue(vertices <= 65535, "Too many pickup vertices");
  const output = new Uint8Array(0xac + faces * 20 + vertices * 8);
  const view = new DataView(output.buffer);
  view.setUint32(0x98, faces, true);
  view.setUint32(0x9c, vertices, true);
  output.set(source.subarray(0xa8, 0xac), 0xa8);
  let firstVertex = 0,
    faceOffset = 0;
  parts.forEach((part, index) => {
    const vertexCount = part[0]!,
      faceCount = part[1]!;
    output.set(part.subarray(0, 2), index * 8);
    view.setUint16(index * 8 + 2, firstVertex, true);
    view.setUint32(index * 8 + 4, faceOffset, true);
    for (let face = 0; face < faceCount; ++face) {
      const offset = 8 + face * 20,
        command = part[offset + 3];
      requireValue(command === 0x30 || command === 0x38, "Unsupported pickup face command");
      for (let corner = 0; corner < (command === 0x38 ? 4 : 3); ++corner)
        requireValue(part[offset + 4 + corner]! < vertexCount, "Pickup face vertex outside group");
    }
    output.set(part.subarray(8, 8 + faceCount * 20), 0xac + faceOffset);
    output.set(part.subarray(8 + faceCount * 20), 0xac + faces * 20 + firstVertex * 8);
    faceOffset += faceCount * 20;
    firstVertex += vertexCount;
  });
  return output;
}
