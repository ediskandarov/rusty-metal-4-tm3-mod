import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { readBlocks, splitVab, TextureRectangle } from "@rusty-metal-4/tm3-resources";
import { readMr } from "@tm4/resources/compatibility/mr";
import { binary, directory, stringEntry, writeMr } from "@tm4/resources/mods/mr-writer";

import { buildSharedModule } from "./native.ts";

function verified(bytes: Uint8Array<ArrayBuffer>, name: string, expected: string) {
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== expected) {
    throw Error(`${name}: expected the TM3 USA v1.1 resource`);
  }
  return bytes;
}

function integerEntry(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return { type: 4, arraySize: 65535, bytes };
}

function required<T>(entries: Map<string, T>, name: string) {
  const entry = entries.get(name);
  if (entry === undefined) throw Error(`Missing Neon City resource: ${name}`);
  return entry;
}

async function neonReflections(readFile: Awaited<ReturnType<typeof openDataDisc>>) {
  const image = await readMr(await readFile("/DATA/NEON.IMG"));
  const materials = await readMr(await readFile("/DATA/NEON.MR"));
  const world = required(image.root.folders, "world");
  const textures = required(materials.directories, "Root/world/textures");
  const texels = new TextureRectangle(required(world.files, "world.bit").bytes);
  const palettes = new TextureRectangle(required(world.files, "world.clt").bytes);

  // The game expects these two 64x64 materials side by side in a 16-bit VRAM rectangle.
  const bitmap = new Uint8Array(8 + 128 * 64 * 2);
  const view = new DataView(bitmap.buffer);
  [640, 0, 128, 64].forEach((value, index) => view.setUint16(index * 2, value, true));
  for (const [tile, name] of ["reflchro", "reflspec"].entries()) {
    const { bytes } = required(textures.files, name);
    const uv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const left = uv.getUint8(0);
    const top = uv.getUint8(1);
    const clut = uv.getUint16(2, true);
    const page = uv.getUint16(6, true);
    if (page & 0x180 || uv.getUint8(4) - left !== 63 || uv.getUint8(5) - top !== 63)
      throw Error(`Unexpected 4-bit reflection texture: ${name}`);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const u = left + x;
        const v = top + y;
        const indices = texels.word((page & 15) * 64 + (u >> 2), ((page >> 4) & 1) * 256 + v);
        const index = (indices >> ((u & 3) * 4)) & 15;
        const color = palettes.word((clut & 63) * 16 + index, clut >> 6);
        view.setUint16(8 + (y * 128 + tile * 64 + x) * 2, color, true);
      }
    }
  }
  return { ...binary(bitmap), arraySize: bitmap.length };
}

const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    "tm3-disc": { type: "string" },
    "tm4-disc": { type: "string" },
    output: { type: "string", default: "build/TM3.MR" },
    "game-build": { type: "string", default: "external/rusty-metal-4/build/diagnostic" },
  },
});
if (!values["tm3-disc"] || !values["tm4-disc"])
  throw Error(
    "Usage: bun run build:shared --tm3-disc DIR --tm4-disc DIR [--output FILE] [--game-build DIR]",
  );

const tm3 = await openDataDisc(values["tm3-disc"]);
const tm4 = await openDataDisc(values["tm4-disc"]);
const terrain = readBlocks(await tm3("/WORLDS/EGYPT.TER"), 8, true);
const images = readBlocks(await tm3("/WORLDS/EGYPT.IMG"), 3, true);
const sources = [
  ["decals", terrain[5]!, "1609455e1c84bf2fb073c519c48aa675689fd6a1c4510405e735f485379ef564"],
  ["sprites", terrain[6]!, "5a757a6f755e13f6ae67425b25e0d9e1c4ebd8166f0c5390a31ef8b4984abf18"],
  ["weapons", terrain[7]!, "901bd105a5f8ad555c382e5f25369bbf06f5490878c7bbbd38751a0008df5118"],
  ["graphics.bit", images[2]!, "3b14422c5cfc546fd9919651fdcf20d302df97c711f587ccb9e9fcf8d346c70f"],
] as const;
const root = directory();
root.files.set("resourcePack", stringEntry("tm3"));
for (const [name, block, hash] of sources) {
  root.files.set(name, binary(verified(block.bytes, name, hash)));
}
root.files.set("reflections.bit", await neonReflections(tm4));
root.files.set("weaponsSize", integerEntry(terrain[7]!.size));

const sounds = verified(
  await tm3("/TM3.VAB"),
  "TM3.VAB",
  "634624d7aff6161664c2daa169d940290b5931f521d69f7742b214d8dd223513",
);
const banks = directory();
for (const [id, bytes] of splitVab(sounds).entries()) {
  if (!bytes) continue;
  const bank = directory();
  bank.files.set("data", binary(bytes));
  bank.files.set("size", integerEntry(bytes.length));
  banks.folders.set(String(id), bank);
}
root.folders.set("soundBanks", banks);

const wasm = await buildSharedModule(values["game-build"], resolve("build/shared"));
root.files.set("behavior.mod", { ...binary(wasm), type: 6 });

const archive = writeMr(root);
await mkdir(dirname(values.output), { recursive: true });
await Bun.write(values.output, archive);
console.log(values.output);
