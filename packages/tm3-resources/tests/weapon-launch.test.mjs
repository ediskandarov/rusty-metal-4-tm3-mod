import { expect, test } from "bun:test";

import { readMr } from "@tm4/resources/compatibility/mr";
import { directory, writeMr } from "@tm4/resources/mods/mr-writer";

import { writeWorldWeapons } from "../src/world/weapons.ts";

test("TM3 map projectiles start along the car axis before their individual launch offsets", async () => {
  const root = directory();
  root.folders.set("world", directory());
  root.folders.set("objects", directory());
  writeWorldWeapons(root);
  const { directories } = await readMr(writeMr(root));
  for (const name of ["Fire", "Homing", "Power", "Speed", "Napalm", "Ricochet", "Rain", "Mortar"]) {
    const mount = directories.get("Root/weaponProfiles/tm3" + name).files.get("launcher");
    expect(mount?.type).toBe(15);
    expect(mount.arraySize).toBe(65535);
    expect(mount.bytes.length).toBe(16);
    const view = new DataView(mount.bytes.buffer, mount.bytes.byteOffset);
    expect([8, 10, 12].map((offset) => view.getInt16(offset, true))).toEqual([0, 0, 4096]);
  }
});
