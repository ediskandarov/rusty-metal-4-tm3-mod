import { expect, test } from "bun:test";

import { binary, directory, stringEntry } from "@tm4/resources/mods/mr-writer";

import { bindMapBehavior } from "../../apps/build-maps/src/behavior.ts";

function resource(pickup?: string, motion?: number) {
  const root = directory();
  const world = directory();
  world.files.set("weaponSet", stringEntry("Tm3WorldWeapons"));
  if (pickup) world.files.set("tm3MapWeapon", stringEntry(pickup));
  root.folders.set("world", world);
  const prop = directory();
  if (motion !== undefined) {
    const mesh = new Uint8Array(28);
    mesh[26] = motion;
    prop.files.set("mesh", binary(mesh));
    let parent = root;
    for (const name of ["objects", "tm3Prop", "instances", "startup"]) {
      const child = directory();
      parent.folders.set(name, child);
      parent = child;
    }
    parent.folders.set("prop", prop);
  }
  return { root, world, prop };
}
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes).split("\0")[0];

test("static maps keep common gameplay without a module", () => {
  const { root, world, prop } = resource(undefined, 0);
  expect(bindMapBehavior("blimp", root)).toBeUndefined();
  expect(text(world.files.get("weaponSet")?.bytes)).toBe("Tm3WorldWeapons");
  expect(prop.files.has("behavior")).toBe(false);
});

test("map weapons and moving props bind to their owning module", () => {
  for (const [id, pickup, motion, handler] of [
    ["egypt", "Eye", undefined, undefined],
    ["tokyo", "Radar", 1, "Tm3TokyoRadar"],
    ["hangar-18", "Spaceship", 2, "Tm3HangarSaucer"],
  ] as const) {
    const { root, world, prop } = resource(pickup, motion);
    const behavior = bindMapBehavior(id, root)!;
    expect(text(world.files.get("weaponSet")?.bytes)).toBe(behavior.weaponSet);
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
