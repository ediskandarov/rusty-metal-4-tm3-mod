import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { binary, writeMr } from "@tm4/resources/mods/mr-writer";

import { createModuleBuilder } from "../../wasm.ts";
import { cars } from "./catalog.ts";
import { buildCarResource } from "./resource.ts";
import { carModuleSources } from "./sources.ts";

const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    "tm3-disc": { type: "string" },
    "game-build": { type: "string", default: "external/rusty-metal-4/build/diagnostic" },
    output: { type: "string", default: "build/cars" },
    car: { type: "string", multiple: true },
    "test-hooks": { type: "boolean", default: false },
  },
});
if (!values["tm3-disc"])
  throw Error(
    "Usage: bun run build:cars --tm3-disc DIR [--car sweet-tooth] [--game-build DIR] [--output DIR] [--test-hooks]",
  );
for (const id of values.car ?? [])
  if (!cars.some((car) => car.id === id)) throw Error(`Unknown car: ${id}`);
const selected = values.car ? cars.filter((car) => values.car!.includes(car.id)) : cars;
const disc = await openDataDisc(values["tm3-disc"]);
const compile = await createModuleBuilder(values["game-build"]);
const root = resolve(import.meta.dir, "../../..");
await mkdir(values.output, { recursive: true });
for (const car of selected) {
  const resource = await buildCarResource(car, await disc(`/CARS/${car.file}.CAR`));
  const wasm = await compile({
    name: car.module,
    sources: carModuleSources(car.id),
    output: join(root, "build/modules"),
    defines: values["test-hooks"] ? [`${car.testDefine}=1`] : [],
  });
  resource.files.set("behavior.mod", { ...binary(wasm), type: 6 });
  const output = join(values.output, `${car.file}.MR`);
  await Bun.write(output, writeMr(resource));
  console.log(output);
}
