import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { moduleName } from "@tm4/resources/mods/modules";

import { cars } from "../../apps/build-cars/src/catalog.ts";
import { readMr } from "../../external/rusty-metal-4/packages/resources/src/compatibility/mr.ts";
import { writeMr } from "../../external/rusty-metal-4/packages/resources/src/mods/mr-writer.ts";

function verifyBehavior(root, stem) {
  const wasm = root.files.get("behavior.mod")?.bytes;
  if (!stem) {
    if (wasm) throw Error("Unexpected map module");
    return;
  }
  if (!wasm || moduleName(wasm) !== stem + ".sym")
    throw Error("Missing or mismatched Wasm behavior: " + stem);
}

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
    const bytes = new Uint8Array(await Bun.file(input).arrayBuffer());
    verifyBehavior((await readMr(bytes)).root, item.stem);
    const folder = resolve(output, item.directory);
    await mkdir(folder, { recursive: true });
    await Bun.write(resolve(folder, item.file + ".MR"), bytes);
  }
}

export function prepareMapFixture(root, module, engineSite) {
  verifyBehavior(root, module);
  return { site: resolve(engineSite), archive: writeMr(root) };
}

// Resolve the test inventory from authored MR order, never stock weapon numbers.
export function weaponSlots(root) {
  const slots = {};
  for (const entry of root.folders.get("world").folders.get("arsenal").folders.values()) {
    const profile = new TextDecoder().decode(entry.files.get("profile").bytes).split("\0")[0];
    const bytes = entry.files.get("order").bytes;
    slots[profile] = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(
      0,
      true,
    );
  }
  return slots;
}
