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

export async function prepareMapFixture(root, module, engineSite, output) {
  const { readdir, realpath, symlink } = await import("node:fs/promises");
  const site = resolve(output, "site");
  await mkdir(resolve(site, "modules"), { recursive: true });
  const link = async (source, target) => {
    try {
      await symlink(await realpath(source), target);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  };
  for (const name of await readdir(engineSite)) {
    if (name === "modules") continue;
    await link(resolve(engineSite, name), resolve(site, name));
  }
  for (const name of await readdir(resolve(engineSite, "modules"))) {
    if (name === module + ".wasm") continue;
    await link(resolve(engineSite, "modules", name), resolve(site, "modules", name));
  }
  const wasm = root.files.get("behavior.mod")?.bytes;
  if (module) {
    if (!wasm || !WebAssembly.validate(wasm)) throw Error("Missing map Wasm " + module);
    await Bun.write(resolve(site, "modules", module + ".wasm"), wasm);
    const name = new TextEncoder().encode(module + ".sym*\0");
    const descriptor = new Uint8Array(Math.ceil((20 + name.length) / 4) * 4);
    new DataView(descriptor.buffer).setUint32(16, 20, true);
    descriptor.set(name, 20);
    root.files.set("behavior.mod", { ...binary(descriptor), type: 6 });
  } else if (wasm) throw Error("Unexpected map module");
  return { site, archive: writeMr(root) };
}
