import { resolve } from "node:path";
const sourceRoot = resolve(import.meta.dir, "../../../src/cars");
const helpers: Record<string, readonly string[]> = {
  "sweet-tooth": ["special.c"],
  axel: ["wave.c"],
  clubkid: ["render.c"],
  outlaw: ["attack.c"],
  thumper: ["render.c"],
  warthog: ["projectile.c", "damage.c"],
  spectre: ["projectile.c"],
  roadkill: ["projectile.c", "impact.c"],
  "mr-grimm": ["projectile.c"],
  minion: ["projectile.c"],
  "flower-power": ["projectile.c"],
  primeval: ["projectile.c"],
};
export function carModuleSources(id: string): string[] {
  return ["module.c", ...(helpers[id] ?? [])].map((file) => resolve(sourceRoot, id, file));
}
