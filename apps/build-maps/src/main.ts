import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { convertWorld } from "@rusty-metal-4/tm3-resources";

import { maps } from "./catalog.ts";

const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    "tm3-disc": { type: "string" },
    output: { type: "string", default: "build/maps" },
    map: { type: "string", multiple: true },
  },
});
if (!values["tm3-disc"])
  throw Error("Usage: bun run build:maps --tm3-disc DIR [--map hollywood] [--output DIR]");
for (const id of values.map ?? [])
  if (!maps.some((map) => map.id === id)) throw Error(`Unknown map: ${id}`);
const selected = values.map ? maps.filter((map) => values.map!.includes(map.id)) : maps;
const disc = await openDataDisc(values["tm3-disc"]);
await mkdir(values.output, { recursive: true });
for (const map of selected) {
  const converted = await convertWorld(
    await disc(`/WORLDS/${map.file}.TER`),
    await disc(`/WORLDS/${map.file}.IMG`),
  );
  const output = join(values.output, map.file);
  await Bun.write(output + ".MR", converted.archive);
  await Bun.write(output + ".IMG", converted.imageArchive);
  console.log(`${output}.MR + .IMG`);
}
