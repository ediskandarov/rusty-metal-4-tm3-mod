import type { CarReflections } from "@rusty-metal-4/tm3-resources";

import { augerReflections } from "./auger.ts";
import { axelReflections } from "./axel.ts";
import { clubKidReflections } from "./clubkid.ts";
import { darksideReflections } from "./darkside.ts";
import { firestarterReflections } from "./firestarter.ts";
import { flowerPowerReflections } from "./flower-power.ts";
import { hammerheadReflections } from "./hammerhead.ts";
import { minionReflections } from "./minion.ts";
import { mrGrimmReflections } from "./mr-grimm.ts";
import { outlawReflections } from "./outlaw.ts";
import { primevalReflections } from "./primeval.ts";
import { roadkillReflections } from "./roadkill.ts";
import { spectreReflections } from "./spectre.ts";
import { thumperReflections } from "./thumper.ts";
import { warthogReflections } from "./warthog.ts";

function range(first: number, last: number, strength: number): [number, number][] {
  return Array.from({ length: last - first + 1 }, (_, i) => [first + i, strength]);
}

// Authored source-face assignments, not recovered TM3 fields.
// See docs/tm3-sweet-tooth-reflections.md for material choices and TM4 references.
// Damage-only faces are omitted; shared gun faces retain their metal finish.
const sweetTooth: CarReflections = [
  new Map([
    ...range(29, 33, 20), // Rear bumper.
    ...range(39, 43, 20), // Front bumper.
    ...range(53, 57, 30), // Cab paint.
    [58, 48], // Separate windshield.
    ...range(59, 67, 30),
    ...range(85, 97, 30), // Rear box, including mixed glass/paint faces.
    ...range(112, 114, 30), // Nose paint.
    [115, 20], // Grille/headlights.
    ...range(128, 129, 30), // Printed rear door.
    ...range(134, 137, 20), // Right gun barrel; muzzle stays matte.
    ...range(140, 143, 20), // Left gun barrel.
  ]),
  new Map([
    [5, 20], // Shared gun barrels.
    [7, 20],
    [8, 20], // Rear bumper.
    [10, 30], // Rear door.
    ...range(14, 20, 30), // Rear box.
    ...range(34, 41, 30), // Cab: windshield is merged with painted header.
    [56, 20], // Grille/headlights.
    ...range(57, 59, 30), // Nose paint.
    [64, 20], // Front bumper.
  ]),
  new Map(), // Distant impostor stays matte, as in original TM4 cars.
];

export function carReflections(id: string): CarReflections | undefined {
  if (id === "auger") return augerReflections;
  if (id === "axel") return axelReflections;
  if (id === "clubkid") return clubKidReflections;
  if (id === "darkside") return darksideReflections;
  if (id === "firestarter") return firestarterReflections;
  if (id === "flower-power") return flowerPowerReflections;
  if (id === "mr-grimm") return mrGrimmReflections;
  if (id === "hammerhead") return hammerheadReflections;
  if (id === "minion") return minionReflections;
  if (id === "outlaw") return outlawReflections;
  if (id === "primeval") return primevalReflections;
  if (id === "roadkill") return roadkillReflections;
  if (id === "spectre") return spectreReflections;
  if (id === "thumper") return thumperReflections;
  if (id === "warthog") return warthogReflections;
  return id === "sweet-tooth" ? sweetTooth : undefined;
}
