import { at, readBlocks, requireValue } from "../shared/binary.ts";
import { sampleTexture, TextureRectangle } from "../shared/texture.ts";

/** IMG rectangles upload in file order; later rectangles replace earlier VRAM words. */
export class WorldVram {
  readonly blocks;
  readonly rectangles: TextureRectangle[];
  private readonly words = new Uint16Array(1024 * 512);
  private readonly uploaded = new Uint8Array(1024 * 512);
  constructor(bytes: Uint8Array) {
    this.blocks = readBlocks(bytes, 3, true);
    this.rectangles = this.blocks.map((block) => new TextureRectangle(block.bytes));
    for (const rectangle of this.rectangles) {
      for (let y = 0; y < rectangle.height; ++y)
        for (let x = 0; x < rectangle.width; ++x) {
          const index = (rectangle.y + y) * 1024 + rectangle.x + x;
          this.words[index] = at(rectangle.words, y * rectangle.width + x);
          this.uploaded[index] = 1;
        }
    }
  }
  word(x: number, y: number) {
    requireValue(
      Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 1024 && y >= 0 && y < 512,
      `VRAM address out of bounds: ${x}, ${y}`,
    );
    const index = y * 1024 + x;
    requireValue(this.uploaded[index], `Texture reads outside IMG uploads: ${x}, ${y}`);
    return at(this.words, index);
  }
  sample(page: number, clut: number, u: number, v: number) {
    return sampleTexture(this, page, clut, u, v);
  }
}
