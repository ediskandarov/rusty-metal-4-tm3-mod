import type { MrDirectory } from "@tm4/resources/compatibility/mr";
import { directory, stringEntry } from "@tm4/resources/mods/mr-writer";

import { mapWeaponProfile } from "../../../packages/tm3-resources/src/world/weapons.ts";

interface MapBehavior {
  module: string;
  className?: string;
  pickup: string;
  props: Readonly<Record<number, string>>;
  sources: readonly string[];
}

export const mapBehaviors: Readonly<Record<string, MapBehavior>> = {
  egypt: {
    module: "mt3egypt",
    className: "tm3Egypt",
    pickup: "Eye",
    props: {},
    sources: ["module.c", "eye.c"],
  },
  tokyo: {
    module: "mt3tokyo",
    pickup: "Radar",
    props: { 1: "Tm3TokyoRadar" },
    sources: ["module.c", "radar.c"],
  },
  "hangar-18": {
    module: "mtm3h18",
    pickup: "Spaceship",
    props: { 2: "Tm3HangarSaucer" },
    sources: ["module.c", "saucer.c"],
  },
};

export function bindMapBehavior(id: string, root: MrDirectory): MapBehavior | undefined {
  const world = root.folders.get("world");
  if (!world) throw Error(`${id}: missing world`);
  const behavior = mapBehaviors[id];
  const pickupBytes = world.files.get("tm3MapWeapon")?.bytes;
  const pickup = pickupBytes ? new TextDecoder().decode(pickupBytes).split("\0")[0] : undefined;
  if (pickup !== behavior?.pickup) throw Error(`${id}: unexpected map weapon ${pickup ?? "none"}`);
  const props = root.folders
    .get("objects")
    ?.folders.get("tm3Prop")
    ?.folders.get("instances")
    ?.folders.get("startup");
  for (const [name, prop] of props?.folders ?? []) {
    const mesh = prop.files.get("mesh")?.bytes;
    if (!mesh || mesh.length < 28) throw Error(`${id}/${name}: missing prop mesh`);
    const motion = mesh[26]!;
    if (!motion) continue;
    const handler = behavior?.props[motion];
    if (!handler) throw Error(`${id}/${name}: no behavior for prop motion ${motion}`);
    prop.files.set("behavior", stringEntry(handler));
  }
  if (behavior) {
    const profile = mapWeaponProfile(behavior.pickup)!;
    const weapon = root.folders.get("weaponProfiles")?.folders.get(profile.profile);
    if (!weapon) throw Error(`${id}: missing map weapon descriptor`);
    const launch = weapon.files.get("launchFunc");
    if (
      !launch ||
      launch.type !== 2 ||
      new TextDecoder().decode(launch.bytes).split("\0")[0] !== profile.launchFunc
    )
      throw Error(`${id}: incorrect launcher for ${profile.profile}`);
    if (behavior.className)
      root.folders.get("objects")!.folders.set(behavior.className, directory());
  }
  return behavior;
}
