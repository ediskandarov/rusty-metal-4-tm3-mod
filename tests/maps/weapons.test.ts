import { expect, test } from "bun:test";

import type { MrEntry } from "@tm4/resources/compatibility/mr";
import { directory } from "@tm4/resources/mods/mr-writer";

import { writeWorldWeapons } from "../../packages/tm3-resources/src/world/weapons.ts";

const value = (entry: MrEntry) =>
  new DataView(entry.bytes.buffer, entry.bytes.byteOffset).getInt32(0, true);
const text = (entry: MrEntry) => new TextDecoder().decode(entry.bytes).split("\0")[0];
function resource(mapWeapon?: string) {
  const root = directory();
  root.folders.set("objects", directory());
  writeWorldWeapons(root, mapWeapon);
  return root.folders
    .get("objects")!
    .folders.get("car")!
    .folders.get("weapon")!
    .folders.get("list")!;
}

test("ordinary weapon MR preserves ammunition, delays, detonation and named launchers", () => {
  const list = resource();
  const expected = {
    Fire: [2, 10, 4096, 0, 0, "Tm3LaunchWorldProjectile"],
    Homing: [0, 10, 4096, 0, 0, "Tm3LaunchWorldProjectile"],
    Power: [0, 5, 4096, 0, 0, "Tm3LaunchWorldProjectile"],
    Speed: [0, 30, 820, 1, 0, "Tm3LaunchWorldProjectile"],
    Napalm: [1, 10, 4096, 0, 0, "Tm3LaunchWorldProjectile"],
    Remote: [0, 5, 4096, 0, 1, "Tm3PlaceRemote"],
    Ricochet: [0, 3, 4096, 0, 0, "Tm3LaunchWorldProjectile"],
    Rain: [0, 10, 4096, 0, 1, "Tm3LaunchWorldProjectile"],
    Mortar: [0, 10, 4096, 0, 0, "Tm3LaunchWorldProjectile"],
    Lightning: [0, 10, 4096, 0, 0, "Tm3LaunchLightning"],
  };
  expect([...list.folders.keys()].sort()).toEqual(Object.keys(expected).sort());
  for (const [name, parameters] of Object.entries(expected)) {
    const files = list.folders.get(name)!.files;
    expect([
      ...["initial", "max", "delay", "repeat", "detonate"].map((key) => value(files.get(key)!)),
      text(files.get("launchFunc")!),
    ]).toEqual(parameters);
    expect(files.get("delay")!.type).toBe(13);
    expect(files.get("launchFunc")!.type).toBe(2);
  }
  expect(list.folders.has("Special")).toBe(false);
  expect(list.folders.has("Freeze")).toBe(false);
});

test("map weapon parameters use the common slot and leave launcher binding to its module", () => {
  for (const name of ["Eye", "Radar", "Spaceship"]) {
    const files = resource(name).folders.get("Proximity")!.files;
    expect(text(files.get("hudName")!)).toBe(name);
    expect([
      ...["initial", "max", "delay", "repeat", "detonate"].map((key) => value(files.get(key)!)),
    ]).toEqual([0, 10, 4096, 0, 0]);
    expect(files.has("launchFunc")).toBe(false);
  }
});
