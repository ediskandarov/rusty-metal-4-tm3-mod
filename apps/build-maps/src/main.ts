import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { convertWorld } from "@rusty-metal-4/tm3-resources";
import { readMr } from "@tm4/resources/compatibility/mr";
import { binary, writeMr } from "@tm4/resources/mods/mr-writer";

import { createModuleBuilder } from "../../wasm.ts";
import { bindMapBehavior } from "./behavior.ts";
import { maps } from "./catalog.ts";

const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    "tm3-disc": { type: "string" },
    "tm4-disc": { type: "string" },
    "game-build": { type: "string", default: "external/rusty-metal-4/build/diagnostic" },
    output: { type: "string", default: "build/maps" },
    map: { type: "string", multiple: true },
  },
});
if (!values["tm3-disc"] || !values["tm4-disc"])
  throw Error(
    "Usage: bun run build:maps --tm3-disc DIR --tm4-disc DIR [--map hollywood] [--output DIR]",
  );
for (const id of values.map ?? [])
  if (!maps.some((map) => map.id === id)) throw Error(`Unknown map: ${id}`);
const selected = values.map ? maps.filter((map) => values.map!.includes(map.id)) : maps;
const sourceRoot = resolve(import.meta.dir, "../../../src/maps");
let compile: Awaited<ReturnType<typeof createModuleBuilder>> | undefined;
const disc = await openDataDisc(values["tm3-disc"]);
const tm4 = await openDataDisc(values["tm4-disc"]);
const game = await readMr(await tm4("/DATA/GAME.MR"));
const powerupResources = game.directories.get("Root/objects/powerup");
if (!powerupResources) throw Error("Missing TM4 powerup resources");
await mkdir(values.output, { recursive: true });
for (const map of selected) {
  const converted = await convertWorld(
    await disc(`/WORLDS/${map.file}.TER`),
    await disc(`/WORLDS/${map.file}.IMG`),
    { powerupResources },
  );
  const behavior = bindMapBehavior(map.id, converted.root);
  if (behavior) {
    compile ??= await createModuleBuilder(values["game-build"]);
    const wasm = await compile({
      name: behavior.module,
      sources: behavior.sources.map((file) => join(sourceRoot, map.id, file)),
      output: resolve("build/modules"),
    });
    converted.root.files.set("behavior.mod", { ...binary(wasm), type: 6 });
  }
  const output = join(values.output, map.file);
  await Bun.write(output + ".MR", writeMr(converted.root));
  await Bun.write(output + ".IMG", converted.imageArchive);
  console.log(`${output}.MR + .IMG`);
}
