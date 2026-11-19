import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { cars } from "../../apps/build-cars/src/catalog.ts";
import { readMr } from "../../external/rusty-metal-4/packages/resources/src/compatibility/mr.ts";
import {
  binary,
  writeMr,
} from "../../external/rusty-metal-4/packages/resources/src/mods/mr-writer.ts";

// Only test packaging is adapted until the port accepts raw Wasm behavior.mod.
// Compiled Wasm bytes are unchanged. Production builders always embed them.
export async function prepareFixture(output, shared, carDirectory) {
  for (const item of [
    { directory: "tm3resources", file: "TM3", stem: "mtm3fx" },
    ...cars.map((car) => ({
      directory: "tm3" + car.testDefine.slice(4, -5).toLowerCase(),
      file: car.file,
      stem: car.module,
    })),
  ]) {
    const input = item.stem === "mtm3fx" ? shared : resolve(carDirectory, item.file + ".MR");
    const root = (await readMr(new Uint8Array(await Bun.file(input).arrayBuffer()))).root;
    const wasm = root.files.get("behavior.mod")?.bytes;
    if (!wasm || !WebAssembly.validate(wasm)) throw Error(input + ": missing Wasm behavior");
    const folder = resolve(output, item.directory);
    await mkdir(folder, { recursive: true });
    await Bun.write(resolve(folder, item.stem + ".wasm"), wasm);
    const name = new TextEncoder().encode(item.stem + ".sym*\0");
    const descriptor = new Uint8Array(Math.ceil((20 + name.length) / 4) * 4);
    new DataView(descriptor.buffer).setUint32(16, 20, true);
    descriptor.set(name, 20);
    root.files.set("behavior.mod", { ...binary(descriptor), type: 6 });
    await Bun.write(resolve(folder, item.file + ".MR"), writeMr(root));
  }
}
