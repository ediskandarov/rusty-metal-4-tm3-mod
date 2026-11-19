import { at, readBlocks } from "../shared/binary.ts";
import { TextureRectangle } from "../shared/texture.ts";
import { readVab } from "../shared/vab.ts";
import { readModel } from "./model.ts";
import { readParameters } from "./parameters.ts";
export function readCar(bytes: Uint8Array) {
  const blocks = readBlocks(bytes, 6);
  readVab(at(blocks, 5).bytes);
  return {
    blocks,
    parameters: readParameters(at(blocks, 0).bytes),
    models: blocks.slice(1, 4).map((block) => readModel(block.bytes)),
    texture: new TextureRectangle(at(blocks, 4).bytes),
    specialVab: at(blocks, 5).bytes,
  };
}
