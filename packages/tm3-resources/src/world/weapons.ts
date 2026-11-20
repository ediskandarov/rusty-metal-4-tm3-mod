import type { MrDirectory } from "@tm4/resources/compatibility/mr";
import { binary, directory, stringEntry } from "@tm4/resources/mods/mr-writer";

// SCUS_942.49: initial ammo/capacity at 8007e0f8; delay at 8002cfbc/80033d30.
// Map-specific launchers are bound by the map build.
const weapons = [
  ["Fire", 2, 10, "Tm3LaunchWorldProjectile"],
  ["Homing", 0, 10, "Tm3LaunchWorldProjectile"],
  ["Power", 0, 5, "Tm3LaunchWorldProjectile"],
  ["Speed", 0, 30, "Tm3LaunchWorldProjectile"],
  ["Napalm", 1, 10, "Tm3LaunchWorldProjectile"],
  ["Remote", 0, 5, "Tm3PlaceRemote"],
  ["Ricochet", 0, 3, "Tm3LaunchWorldProjectile"],
  ["Rain", 0, 10, "Tm3LaunchWorldProjectile"],
  ["Mortar", 0, 10, "Tm3LaunchWorldProjectile"],
  ["Lightning", 0, 10, "Tm3LaunchLightning"],
  ["Proximity", 0, 10, undefined],
] as const;

function integer(value: number, type: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return { ...binary(bytes), type };
}

export function writeWorldWeapons(root: MrDirectory, mapWeapon: string | undefined) {
  const objects = root.folders.get("objects")!;
  objects.folders.set("tm3WorldWeapons", directory());
  const car = directory(),
    weapon = directory(),
    list = directory();
  for (const [name, initial, maximum, launchFunc] of weapons) {
    if (name === "Proximity" && !mapWeapon) continue;
    const entry = directory();
    entry.files.set("initial", integer(initial, 4));
    entry.files.set("max", integer(maximum, 4));
    entry.files.set("delay", integer(name === "Speed" ? 0x334 : 0x1000, 13));
    entry.files.set("repeat", integer(name === "Speed" ? 1 : 0, 11));
    entry.files.set("detonate", integer(name === "Remote" || name === "Rain" ? 1 : 0, 11));
    if (launchFunc) entry.files.set("launchFunc", stringEntry(launchFunc));
    if (name === "Proximity") entry.files.set("hudName", stringEntry(mapWeapon!));
    list.folders.set(name, entry);
  }
  weapon.folders.set("list", list);
  car.folders.set("weapon", weapon);
  objects.folders.set("car", car);
}
