import { Binary, requireValue } from "../shared/binary.ts";

/** Both renderers store four PS1 packet slots after the four horizon vertices. */
export function readHorizon(bytes: Uint8Array) {
  if (!bytes.length) return null;
  const data = new Binary(bytes);
  const gouraud = data.u8(0),
    flat = data.u8(1),
    textured = data.u8(2);
  const end = 8 + gouraud * 176 + flat * 128 + textured * 196;
  requireValue(
    end <= bytes.length &&
      bytes.length - end <= 4 &&
      bytes.slice(end).every((value) => value === 0),
    "Invalid horizon extent",
  );
  const packets = [];
  let offset = 8;
  for (const [count, stride, packetSize, command] of [
    [gouraud, 176, 36, 0x38],
    [flat, 128, 24, 0x28],
    [textured, 196, 40, 0x2c],
  ] as const) {
    for (let index = 0; index < count; ++index) {
      for (let slot = 0; slot < 4; ++slot) {
        const packet = offset + 32 + slot * packetSize;
        requireValue((data.u8(packet + 7) & 0xfc) === command, "Unsupported horizon packet");
        requireValue(data.u8(packet + 3) === packetSize / 4 - 1, "Invalid horizon packet length");
        if (command === 0x2c) packets.push(packet);
      }
      offset += stride;
    }
  }
  return { gouraud, flat, textured, size: end, textured_packets: packets };
}
