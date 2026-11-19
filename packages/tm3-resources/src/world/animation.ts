import { Binary, requireValue } from "../shared/binary.ts";

/** TM3 8003afb4 and TM4 WorldAnimateTextures consume the same TAR layout. */
export function readTextureAnimations(records: Uint8Array, pixels: Uint8Array, count: number) {
  requireValue(count >= 0 && count <= 8, "Texture animation count exceeds engine capacity");
  const data = new Binary(records);
  const animations = [];
  for (let index = 0; index < count; ++index) {
    const offset = data.u32(index * 4);
    requireValue(offset >= count * 4, "Animation overlaps offset directory");
    const x = data.u16(offset + 20),
      y = data.u16(offset + 22);
    const width = data.u16(offset + 24),
      height = data.u16(offset + 26);
    const frames = data.u32(offset + 32);
    requireValue(
      width > 0 && height > 0 && x + width <= 1024 && y + height <= 512,
      "Animation rectangle outside VRAM",
    );
    requireValue(frames > 0 && frames <= 256, "Invalid animation frame count");
    const frameOffsets = Array.from({ length: frames }, (_, frame) => {
      const word = data.u32(offset + 36 + frame * 4),
        start = word & 0xffffff;
      requireValue(
        start % 4 === 0 && start + width * height * 2 <= pixels.length,
        "Animation frame outside pixel storage",
      );
      return start;
    });
    animations.push({ offset, x, y, width, height, frame_offsets: frameOffsets });
  }
  return animations;
}
