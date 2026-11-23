import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { cars } from "../build-cars/src/catalog.ts";
import { carModuleSources } from "../build-cars/src/sources.ts";
import { mapBehaviors } from "../build-maps/src/behavior.ts";
import { sharedModuleSources } from "../build-shared/src/sources.ts";
import { digest } from "../digest.ts";
import { createModuleBuilder } from "../wasm.ts";

const { values } = parseArgs({
  options: {
    engine: { type: "string" },
    "game-build": { type: "string" },
    release: { type: "string" },
    output: { type: "string" },
  },
});
if (!values.engine || !values["game-build"] || !values.release || !values.output)
  throw Error(
    "Usage: bun apps/browser/build.ts --engine DIR --game-build DIR --release VERSION --output DIR",
  );
const { sha256: runtime } = (await Bun.file(
  join(values["game-build"], "site/simulation-build.json"),
).json()) as { sha256?: unknown };
if (typeof runtime !== "string" || !/^[a-f0-9]{64}$/.test(runtime))
  throw Error("Invalid engine build ID");
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
const stage = await mkdtemp(join(dirname(output), ".converter-"));
try {
  const modules = join(stage, "modules");
  const compile = await createModuleBuilder(values["game-build"], values.engine);
  const files: { path: string; sha256: string }[] = [];
  async function add(name: string, bytes: Uint8Array<ArrayBuffer>) {
    files.push({ path: name, sha256: await digest(bytes) });
  }
  await add(
    "modules/mtm3fx.wasm",
    await compile({
      name: "mtm3fx",
      sources: sharedModuleSources,
      output: modules,
      inverseRoot: true,
    }),
  );
  for (const car of cars) {
    await add(
      `modules/${car.module}.wasm`,
      await compile({
        name: car.module,
        sources: carModuleSources(car.id),
        output: modules,
      }),
    );
  }
  for (const [id, behavior] of Object.entries(mapBehaviors)) {
    await add(
      `modules/${behavior.module}.wasm`,
      await compile({
        name: behavior.module,
        sources: behavior.sources.map((file) =>
          resolve(import.meta.dir, "../../src/maps", id, file),
        ),
        output: modules,
      }),
    );
  }
  await rm(join(modules, "inverse-root.o"));
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "converter.ts")],
    target: "browser",
    format: "esm",
    outdir: stage,
    minify: true,
    plugins: [
      {
        name: "engine-resource-apis",
        setup(build) {
          build.onResolve({ filter: /^@tm4\/resources\// }, ({ path }) => ({
            path: resolve(
              values.engine!,
              "packages/resources/src",
              path.slice("@tm4/resources/".length) + ".ts",
            ),
          }));
        },
      },
    ],
    define: {
      TM3_RELEASE: JSON.stringify(values.release),
      TM3_RUNTIME: JSON.stringify(runtime),
      TM3_MODULE_HASHES: JSON.stringify(
        Object.fromEntries(files.map(({ path, sha256 }) => [path, sha256])),
      ),
    },
  });
  if (!result.success) throw new AggregateError(result.logs, "Could not bundle TM3 converter");
  await add(
    "converter.js",
    new Uint8Array(await Bun.file(join(stage, "converter.js")).arrayBuffer()),
  );
  await Bun.write(
    join(stage, "release.json"),
    JSON.stringify({ format: 1, id: "tm3", version: values.release, runtime, files }, null, 2),
  );
  await rename(stage, output);
  console.log(output);
} finally {
  await rm(stage, { recursive: true, force: true });
}
