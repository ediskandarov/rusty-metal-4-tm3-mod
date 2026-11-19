import type { MrDirectory } from "@tm4/resources/compatibility/mr";
import { stringEntry } from "@tm4/resources/mods/mr-writer";

interface MapBehavior {
  module: string;
  weaponSet: string;
  pickup: string;
  props: Readonly<Record<number, string>>;
  sources: readonly string[];
}

export const mapBehaviors: Readonly<Record<string, MapBehavior>> = {
  egypt: {
    module: "mt3egypt",
    weaponSet: "Tm3EgyptWeapons",
    pickup: "Eye",
    props: {},
    sources: ["module.c", "eye.c"],
  },
  tokyo: {
    module: "mt3tokyo",
    weaponSet: "Tm3TokyoWeapons",
    pickup: "Radar",
    props: { 1: "Tm3TokyoRadar" },
    sources: ["module.c", "radar.c"],
  },
  "hangar-18": {
    module: "mtm3h18",
    weaponSet: "Tm3HangarWeapons",
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
  if (behavior) world.files.set("weaponSet", stringEntry(behavior.weaponSet));
  return behavior;
}
