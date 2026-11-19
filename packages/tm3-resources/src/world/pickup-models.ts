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
