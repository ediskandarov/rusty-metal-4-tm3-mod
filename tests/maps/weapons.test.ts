import { expect, test } from "bun:test";

import type { MrEntry } from "@tm4/resources/compatibility/mr";
import { directory } from "@tm4/resources/mods/mr-writer";

import { weaponAiCategories } from "../../packages/tm3-resources/src/shared/weapon-ai.ts";
import { writeWorldWeapons } from "../../packages/tm3-resources/src/world/weapons.ts";

const value = (entry: MrEntry) =>
  new DataView(entry.bytes.buffer, entry.bytes.byteOffset).getInt32(0, true);
const text = (entry: MrEntry) => new TextDecoder().decode(entry.bytes).split("\0")[0];
function resource(mapWeapon?: string) {
  const root = directory();
  root.folders.set("objects", directory());
  root.folders.set("world", directory());
  writeWorldWeapons(root, mapWeapon);
  return root.folders.get("weaponProfiles")!;
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
  expect([...list.folders.keys()].sort()).toEqual(
    Object.keys(expected)
      .map((name) => "tm3" + name)
      .sort(),
  );
  for (const [name, parameters] of Object.entries(expected)) {
    const files = list.folders.get("tm3" + name)!.files;
    expect([
      ...["initial", "max", "delay", "repeat", "detonate"].map((key) => value(files.get(key)!)),
      text(files.get("launchFunc")!),
    ]).toEqual(parameters);
    expect(text(files.get("aiCategory")!)).toBe(name.toLowerCase());
    expect(files.get("delay")!.type).toBe(13);
    expect(files.get("launchFunc")!.type).toBe(2);
  }
  expect(list.folders.has("Special")).toBe(false);
  expect(list.folders.has("Freeze")).toBe(false);
});

test("map weapons have distinct identities and launchers before module binding", () => {
  for (const [name, launcher] of [
    ["Eye", "Tm3UseEye"],
    ["Radar", "Tm3LaunchTokyoRadar"],
    ["Spaceship", "Tm3LaunchHangarSpaceship"],
  ] as const) {
    const profiles = resource(name);
    expect(profiles.folders.has("tm3Proximity")).toBe(false);
    const files = profiles.folders.get("tm3" + name)!.files;
    expect(text(files.get("hudName")!)).toBe(name);
    expect([
      ...["initial", "max", "delay", "repeat", "detonate"].map((key) => value(files.get(key)!)),
    ]).toEqual([0, 10, 4096, 0, 0]);
    expect(text(files.get("launchFunc")!)).toBe(launcher);
    expect(files.has("aiProfile")).toBe(false);
    expect(files.has("aiWeights")).toBe(false);
    const category = "tm3:" + name.toLowerCase();
    expect(text(files.get("aiCategory")!)).toBe(category);
    const defaults = weaponAiCategories().folders.get(category)!.files.get("defaultWeights")!;
    expect(defaults.type).toBe(18);
    expect(defaults.arraySize).toBe(12);
    expect([...defaults.bytes]).toEqual(Array<number>(12).fill(0));
  }
});

test("the arsenal selects the map profile without an intermediate Proximity entry", () => {
  for (const name of ["Eye", "Radar", "Spaceship"]) {
    const root = directory();
    root.folders.set("objects", directory());
    root.folders.set("world", directory());
    writeWorldWeapons(root, name);
    const entries = root.folders.get("world")!.folders.get("arsenal")!.folders;
    const profiles = [...entries.values()].map((entry) => text(entry.files.get("profile")!));
    expect(profiles).toContain("tm3" + name);
    expect(profiles).not.toContain("tm3Proximity");
    for (const other of ["Eye", "Radar", "Spaceship"].filter((other) => other !== name))
      expect(profiles).not.toContain("tm3" + other);
    expect([...entries.values()].map((entry) => value(entry.files.get("order")!))).toEqual(
      Array.from({ length: entries.size }, (_, i) => i),
    );
  }
});
