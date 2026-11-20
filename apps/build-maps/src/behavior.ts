import type { MrDirectory } from "@tm4/resources/compatibility/mr";
import { directory, stringEntry } from "@tm4/resources/mods/mr-writer";

interface MapBehavior {
  module: string;
  className?: string;
  launchFunc: string;
  pickup: string;
  props: Readonly<Record<number, string>>;
  sources: readonly string[];
}

export const mapBehaviors: Readonly<Record<string, MapBehavior>> = {
  egypt: {
    module: "mt3egypt",
    className: "tm3Egypt",
    launchFunc: "Tm3UseEye",
    pickup: "Eye",
    props: {},
    sources: ["module.c", "eye.c"],
  },
  tokyo: {
    module: "mt3tokyo",
    launchFunc: "Tm3LaunchTokyoRadar",
    pickup: "Radar",
    props: { 1: "Tm3TokyoRadar" },
    sources: ["module.c", "radar.c"],
  },
  "hangar-18": {
    module: "mtm3h18",
    launchFunc: "Tm3LaunchHangarSpaceship",
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
    const weapon = root.folders
      .get("objects")
      ?.folders.get("car")
      ?.folders.get("weapon")
      ?.folders.get("list")
      ?.folders.get("Proximity");
    if (!weapon) throw Error(`${id}: missing map weapon descriptor`);
    weapon.files.set("launchFunc", stringEntry(behavior.launchFunc));
    if (behavior.className)
      root.folders.get("objects")!.folders.set(behavior.className, directory());
  }
  return behavior;
}
