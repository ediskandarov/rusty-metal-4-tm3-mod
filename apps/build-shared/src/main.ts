import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { binary, writeMr } from "@tm4/resources/mods/mr-writer";

import { createModuleBuilder } from "../../wasm.ts";
import { buildSharedResource } from "./resource.ts";
import { sharedModuleSources } from "./sources.ts";

const args = process.argv.slice(2);
const { values } = parseArgs({
  args: args[0] === "--" ? args.slice(1) : args,
  options: {
    "tm3-disc": { type: "string" },
    "test-hooks": { type: "boolean" },
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
const root = await buildSharedResource(tm3, tm4);
const compile = await createModuleBuilder(values["game-build"]);
const wasm = await compile({
  name: "mtm3fx",
  sources: [
    ...sharedModuleSources,
    ...(values["test-hooks"]
      ? [
          resolve("tests/shared/surface_runtime.c"),
          resolve("tests/shared/turbo.c"),
          resolve("tests/shared/car_effects.c"),
          resolve("tests/shared/teleport_appearance.c"),
          resolve("tests/shared/weapon_profiles.c"),
        ]
      : []),
  ],
  output: resolve("build/shared"),
  inverseRoot: true,
  defines: values["test-hooks"] ? ["TM3_TEST_HOOKS=1"] : [],
});
root.files.set("behavior.mod", { ...binary(wasm), type: 6 });

const archive = writeMr(root);
await mkdir(dirname(values.output), { recursive: true });
await Bun.write(values.output, archive);
console.log(values.output);
