import { at, Binary, requireValue } from "./binary.ts";
export class TextureRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly words: number[];
  constructor(bytes: Uint8Array) {
    const data = new Binary(bytes);
    this.x = data.u16(0);
    this.y = data.u16(2);
    this.width = data.u16(4);
    this.height = data.u16(6);
    const end = 8 + this.width * this.height * 2;
    requireValue(
      this.width > 0 &&
        this.height > 0 &&
        this.x + this.width <= 1024 &&
        this.y + this.height <= 512 &&
        end <= bytes.length,
      "Truncated or out-of-range VRAM rectangle",
    );
    requireValue(
      bytes.length - end <= 4 && bytes.slice(end).every((v) => v === 0),
      "Unknown image tail",
    );
    this.words = Array.from({ length: this.width * this.height }, (_, i) => data.u16(8 + i * 2));
  }
  word(x: number, y: number) {
    requireValue(
      x >= this.x && x < this.x + this.width && y >= this.y && y < this.y + this.height,
      `Texture address outside uploaded rectangle: ${x}, ${y}`,
    );
    return at(this.words, (y - this.y) * this.width + x - this.x);
  }
  sample(page: number, clut: number, u: number, v: number) {
    return sampleTexture(this, page, clut, u, v);
  }
}

/** PS1 texture pages use 4/8-bit CLUT indices or direct 16-bit words. */
export function sampleTexture(
  vram: { word(x: number, y: number): number },
  page: number,
  clut: number,
  u: number,
  v: number,
) {
  requireValue(
    Number.isInteger(u) && Number.isInteger(v) && u >= 0 && u <= 255 && v >= 0 && v <= 255,
    "Invalid texture coordinate",
  );
  const mode = (page >> 7) & 3;
  requireValue(mode < 3, "Reserved texture depth");
  const perWord = at([4, 2, 1], mode);
  let color = vram.word((page & 15) * 64 + Math.floor(u / perWord), ((page >> 4) & 1) * 256 + v);
  if (mode < 2) {
    const bits = 4 << mode;
    const index = (color >> ((u % perWord) * bits)) & ((1 << bits) - 1);
    color = vram.word((clut & 63) * 16 + index, clut >> 6);
  }
  return [
    ...[0, 5, 10].map((shift) => Math.floor((((color >> shift) & 31) * 255) / 31)),
    color === 0 ? 0 : 255,
  ];
}
