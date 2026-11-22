import { expect, test } from "bun:test";

import { binary, directory, stringEntry } from "@tm4/resources/mods/mr-writer";

import { bindMapBehavior } from "../../apps/build-maps/src/behavior.ts";
import { writeWorldWeapons } from "../../packages/tm3-resources/src/world/weapons.ts";

function resource(pickup?: string, motion?: number) {
  const root = directory();
  root.folders.set("objects", directory());
  const world = directory();
  if (pickup) world.files.set("tm3MapWeapon", stringEntry(pickup));
  root.folders.set("world", world);
  writeWorldWeapons(root, pickup);
  const prop = directory();
  if (motion !== undefined) {
    const mesh = new Uint8Array(28);
    mesh[26] = motion;
    prop.files.set("mesh", binary(mesh));
    let parent = root;
    for (const name of ["objects", "tm3Prop", "instances", "startup"]) {
      const child = parent.folders.get(name) ?? directory();
      parent.folders.set(name, child);
      parent = child;
    }
    parent.folders.set("prop", prop);
  }
  return { root, world, prop };
}
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes).split("\0")[0];

test("static maps keep common gameplay without a module", () => {
  const { root, prop } = resource(undefined, 0);
  expect(bindMapBehavior("blimp", root)).toBeUndefined();
  expect(prop.files.has("behavior")).toBe(false);
});

test("map weapons and moving props bind to their owning module", () => {
  for (const [id, pickup, motion, handler] of [
    ["egypt", "Eye", undefined, undefined],
    ["tokyo", "Radar", 1, "Tm3TokyoRadar"],
    ["hangar-18", "Spaceship", 2, "Tm3HangarSaucer"],
  ] as const) {
    const { root, prop } = resource(pickup, motion);
    const behavior = bindMapBehavior(id, root)!;
    expect(root.folders.get("objects")?.folders.has("tm3Egypt") ?? false).toBe(id === "egypt");
    const weapon = root.folders.get("weaponProfiles")!.folders.get("tm3" + pickup)!;
    expect(text(weapon.files.get("hudName")?.bytes)).toBe(pickup);
    expect(behavior.module.length).toBeLessThanOrEqual(8);
    if (handler) expect(text(prop.files.get("behavior")?.bytes)).toBe(handler);
  }
});

test("wrong map weapons and unsupported motion cannot silently use a different handler", () => {
  expect(() => bindMapBehavior("egypt", resource("Radar").root)).toThrow("unexpected map weapon");
  expect(() => bindMapBehavior("hollywood", resource("Eye").root)).toThrow("unexpected map weapon");
  expect(() => bindMapBehavior("egypt", resource("Eye", 1).root)).toThrow("no behavior");
  expect(() => bindMapBehavior("tokyo", resource("Radar", 2).root)).toThrow("no behavior");
  expect(() => bindMapBehavior("blimp", resource(undefined, 3).root)).toThrow("no behavior");
});

test("a missing or wrong map weapon launcher is rejected instead of overwritten", () => {
  const { root } = resource("Radar");
  const weapon = root.folders.get("weaponProfiles")!.folders.get("tm3Radar")!;
  weapon.files.set("launchFunc", stringEntry("Tm3UseEye"));
  expect(() => bindMapBehavior("tokyo", root)).toThrow("incorrect launcher");
  expect(text(weapon.files.get("launchFunc")?.bytes)).toBe("Tm3UseEye");
  root.folders.delete("weaponProfiles");
  expect(() => bindMapBehavior("tokyo", root)).toThrow("missing map weapon descriptor");
});
