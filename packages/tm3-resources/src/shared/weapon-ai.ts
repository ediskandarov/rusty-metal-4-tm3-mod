import { directory } from "@tm4/resources/mods/mr-writer";

import { requireValue } from "./binary.ts";

// TM3 CAR/TER sector tables use these 16 columns. Column 14 has no weapon;
// vehicle specials use 15 (SCUS_942.49, 8001991c and the special launchers).
// Massive is TM4-only and must not inherit a TM3 weapon's probability.
export const tm3WeaponCategories = [
  ["fire", 0],
  ["homing", 1],
  ["power", 2],
  ["freeze", 3],
  ["napalm", 4],
  ["remote", 5],
  ["ricochet", 6],
  ["speed", 7],
  ["rain", 8],
  ["mortar", 9],
  ["tm3:radar", 10],
  ["tm3:eye", 11],
  ["tm3:spaceship", 12],
  ["lightning", 13],
  ["special", 15],
  ["massive", null],
] as const;

export function weaponAiWeights(sectors: readonly (readonly number[])[]) {
  requireValue(
    sectors.length === 12 &&
      sectors.every(
        (sector) =>
          sector.length === 16 &&
          sector.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
      ),
    "Expected 12 TM3 sectors with 16 byte weapon weights",
  );
  const result = directory();
  for (const [category, column] of tm3WeaponCategories) {
    result.files.set(category, {
      type: 18,
      arraySize: 12,
      bytes: Uint8Array.from(sectors, (sector) => (column === null ? 0 : sector[column]!)),
    });
  }
  return result;
}

// These categories have no TM4 counterpart. Original TM3 bots never select
// them; unknown cars inherit that behavior, while players can still fire them.
export function weaponAiCategories() {
  const categories = directory();
  for (const id of ["tm3:eye", "tm3:radar", "tm3:spaceship"]) {
    const entry = directory();
    entry.files.set("defaultWeights", { type: 18, arraySize: 12, bytes: new Uint8Array(12) });
    categories.folders.set(id, entry);
  }
  return categories;
}
