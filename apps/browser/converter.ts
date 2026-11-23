import { convertWorld } from "@rusty-metal-4/tm3-resources";
import type { ModDraft, ModPlan } from "@tm4/mods";
import type { RecipeInput } from "@tm4/mods/recipe";
import { type MrDirectory, readMr } from "@tm4/resources/compatibility/mr";
import { directorySources } from "@tm4/resources/loader/sources";
import { createCarPreview } from "@tm4/resources/mods/car-preview";
import { binary, directory, stringEntry, writeMr } from "@tm4/resources/mods/mr-writer";

import { openDataSources } from "../../packages/disc/src/data.ts";
import { cars } from "../build-cars/src/catalog.ts";
import { buildCarResource } from "../build-cars/src/resource.ts";
import { bindMapBehavior } from "../build-maps/src/behavior.ts";
import { maps } from "../build-maps/src/catalog.ts";
import { buildSharedResource } from "../build-shared/src/resource.ts";
import { digest } from "../digest.ts";

declare const TM3_RELEASE: string;
declare const TM3_RUNTIME: string;
declare const TM3_MODULE_HASHES: Record<string, string>;

const carTitles: Record<string, string> = {
  clubkid: "Club Kid",
  "mr-grimm": "Mr. Grimm",
};
const mapTitles: Record<string, string> = {
  "hangar-18": "Hangar 18",
  "club-kid-house": "Club Kid's House",
};

function title(id: string, names: Record<string, string>) {
  return (
    names[id] ??
    id
      .split("-")
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join(" ")
  );
}

async function addBehavior(resource: MrDirectory, name: string) {
  const path = `modules/${name}.wasm`;
  const expected = TM3_MODULE_HASHES[path];
  if (!expected) throw Error(`No prebuilt module for ${name}`);
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw Error(`Could not load ${name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if ((await digest(bytes)) !== expected) throw Error(`Incorrect module bytes for ${name}`);
  resource.files.set("behavior.mod", { ...binary(bytes), type: 6 });
}

function mapPortrait() {
  // The engine's world picker samples a 118 × 121 indexed TIM with a 256-color palette.
  const width = 118;
  const height = 121;
  const pixels = 544;
  const bytes = new Uint8Array(pixels + width * height + 2);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 16, true);
  view.setUint32(4, 9, true);
  view.setUint32(8, 524, true);
  view.setUint16(16, 256, true);
  view.setUint16(18, 1, true);
  view.setUint16(22, 0x20c4, true);
  view.setUint16(24, 0x35a8, true);
  view.setUint32(532, 12 + width * height, true);
  view.setUint16(540, width / 2, true);
  view.setUint16(542, height, true);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) bytes[pixels + y * width + x] = (x + y) % 24 < 4 ? 2 : 1;
  return bytes;
}

export async function build({ modDisc, baseDisc, progress }: RecipeInput): Promise<ModDraft> {
  progress("Reading disc directories…");
  const tm3 = await openDataSources(directorySources(modDisc));
  const tm4 = await openDataSources(directorySources(baseDisc));
  const base: { path: string; sha256: string }[] = [];
  const readBase = async (path: string) => {
    const bytes = await tm4(path);
    base.push({ path, sha256: await digest(bytes) });
    return bytes;
  };

  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const mounts: ModPlan["mounts"] = [];
  const registry: ModPlan["registry"] = [];
  const contents: ModPlan["contents"] = [];
  function mount(path: string, bytes: Uint8Array<ArrayBuffer>) {
    const source = `files/disc${path}`;
    files.set(source, bytes);
    mounts.push({ path, source });
  }
  function register(
    archive: string,
    folder: string[],
    name: string,
    data: MrDirectory,
    key: string,
    kind: "folder" | "binary" = "folder",
  ) {
    const source = `files/registry/${key}.MR`;
    files.set(source, writeMr(data));
    registry.push({ archive, folder, name, source, kind });
  }
  function namedResource(stem: string) {
    const entry = directory();
    entry.files.set("filename", stringEntry(stem));
    return entry;
  }

  progress("Converting shared resources…");
  const shared = await buildSharedResource(tm3, readBase);
  await addBehavior(shared, "mtm3fx");
  register("/DATA/MAIN.MR", ["resourcePacks"], "tm3", shared, "tm3");

  for (const car of cars) {
    const name = "TM3 " + title(car.id, carTitles);
    progress(`Converting ${name}…`);
    const model = await buildCarResource(car, await tm3(`/CARS/${car.file}.CAR`));
    const preview = createCarPreview(model);
    await addBehavior(model, car.module);
    mount(`/DATA/${car.module.toUpperCase()}.MR`, writeMr(model));
    const entry = namedResource(car.module);
    entry.files.set("realname", stringEntry(name));
    register("/DATA/MAIN.MR", ["objects", "car", "characters"], car.module, entry, car.module);
    register(
      "/DATA/MENU/CHAR.MR",
      ["menucars"],
      car.module,
      preview,
      car.module + "-preview",
      "binary",
    );
    contents.push({ id: `tm3:car:${car.id}`, name, kind: "car" });
  }

  const game = await readMr(await readBase("/DATA/GAME.MR"));
  const powerupResources = game.directories.get("Root/objects/powerup");
  if (!powerupResources) throw Error("Missing base-game powerup resources");
  files.set("files/shared/loading.TIM", await readBase("/DATA/TITLE.TIM"));
  files.set("files/shared/portrait.TIM", mapPortrait());
  for (const [i, map] of maps.entries()) {
    const name = title(map.id, mapTitles);
    progress(`Converting ${name}…`);
    const converted = await convertWorld(
      await tm3(`/WORLDS/${map.file}.TER`),
      await tm3(`/WORLDS/${map.file}.IMG`),
      { powerupResources },
    );
    const behavior = bindMapBehavior(map.id, converted.root);
    if (behavior) await addBehavior(converted.root, behavior.module);
    const stem = "tm3map" + i;
    mount(`/DATA/${stem.toUpperCase()}.MR`, writeMr(converted.root));
    mount(`/DATA/${stem.toUpperCase()}.IMG`, converted.imageArchive);
    // Reuse the user's base-game loading screen for maps without a dedicated one.
    mounts.push({ path: `/DATA/${stem.toUpperCase()}.TIM`, source: "files/shared/loading.TIM" });
    registry.push({
      archive: "/DATA/MENU.MR",
      folder: ["menu", "worldpix"],
      name: stem,
      source: "files/shared/portrait.TIM",
      kind: "binary",
    });
    const entry = namedResource(stem);
    // A zero unlock threshold makes the map selectable outside the stock tournament route.
    entry.files.set("unlockAt", { type: 4, arraySize: 65535, bytes: new Uint8Array(4) });
    register("/DATA/MAIN.MR", ["worlds"], name, entry, stem);
    contents.push({ id: `tm3:map:${map.id}`, name, kind: "map" });
  }

  return {
    plan: {
      format: "rm4-mod/1",
      id: "tm3",
      name: "TM3",
      version: TM3_RELEASE,
      runtime: TM3_RUNTIME,
      requires: [],
      base,
      contents,
      mounts,
      registry,
    },
    files,
  };
}
