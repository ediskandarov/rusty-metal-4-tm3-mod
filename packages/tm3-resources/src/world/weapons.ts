import type { MrDirectory } from "@tm4/resources/compatibility/mr";
import { binary, directory, stringEntry } from "@tm4/resources/mods/mr-writer";

// SCUS_942.49: initial ammo/capacity at 8007e0f8; delay at 8002cfbc/80033d30.
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
] as const;

export const mapWeaponProfiles = [
  { name: "Eye", profile: "tm3Eye", launchFunc: "Tm3UseEye" },
  { name: "Radar", profile: "tm3Radar", launchFunc: "Tm3LaunchTokyoRadar" },
  { name: "Spaceship", profile: "tm3Spaceship", launchFunc: "Tm3LaunchHangarSpaceship" },
] as const;

export function mapWeaponProfile(name: string) {
  return mapWeaponProfiles.find((weapon) => weapon.name === name);
}

function integer(value: number, type: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return { ...binary(bytes), type };
}

export function writeWorldWeapons(root: MrDirectory, mapWeapon: string | undefined) {
  const objects = root.folders.get("objects")!;
  objects.folders.set("tm3WorldWeapons", directory());
  const profiles = root.folders.get("weaponProfiles") ?? directory();
  const world = root.folders.get("world")!;
  const arsenal = directory();
  const add = (id: string, profile: string) => {
    const entry = directory();
    entry.files.set("profile", stringEntry(profile));
    entry.files.set("order", integer(arsenal.folders.size, 4));
    arsenal.folders.set(id, entry);
  };
  add("special", "Special");
  add("freeze", "Freeze");
  add("massive", "Massive");
  const selectedMapWeapon = mapWeapon ? mapWeaponProfile(mapWeapon) : undefined;
  if (mapWeapon && !selectedMapWeapon) throw Error(`Unknown map weapon: ${mapWeapon}`);
  const selected = selectedMapWeapon
    ? [...weapons, [selectedMapWeapon.name, 0, 10, selectedMapWeapon.launchFunc] as const]
    : weapons;
  for (const [name, initial, maximum, launchFunc] of selected) {
    const id = "tm3" + name;
    const entry = directory();
    entry.files.set("initial", integer(initial, 4));
    entry.files.set("max", integer(maximum, 4));
    entry.files.set("delay", integer(name === "Speed" ? 0x334 : 0x1000, 13));
    entry.files.set("repeat", integer(name === "Speed" ? 1 : 0, 11));
    entry.files.set("detonate", integer(name === "Remote" || name === "Rain" ? 1 : 0, 11));
    entry.files.set("launchFunc", stringEntry(launchFunc));
    entry.files.set(
      "aiCategory",
      stringEntry(mapWeaponProfile(name) ? "tm3:" + name.toLowerCase() : name.toLowerCase()),
    );
    entry.files.set("model", stringEntry(id));
    entry.files.set("hudName", stringEntry(name));
    if (launchFunc === "Tm3LaunchWorldProjectile") {
      entry.files.set("prepareFunc", stringEntry("Tm3PrepareWorldWeapon"));
      entry.files.set("projectile", stringEntry("Tm3ProjectileType_" + name));
    }
    profiles.folders.set(id, entry);
    add(id, id);
  }
  root.folders.set("weaponProfiles", profiles);
  world.folders.set("arsenal", arsenal);
}

export function tm3WeaponProfile(type: string) {
  const weapon = weapons.find(([name]) => name.toLowerCase() === type.toLowerCase());
  if (weapon) return "tm3" + weapon[0];
  return mapWeaponProfiles.find((weapon) => weapon.name.toLowerCase() === type.toLowerCase())
    ?.profile;
}
