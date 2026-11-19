import type { MrDirectory } from "@tm4/resources/compatibility/mr";
import { binary, directory, writeMr } from "@tm4/resources/mods/mr-writer";

import { at, Binary, requireValue } from "../shared/binary.ts";
import { readTextureAnimations } from "./animation.ts";
import { convertDestroyables } from "./destruction.ts";
import { readHorizon } from "./horizon.ts";
import { readWorld, validateWorldTextures } from "./index.ts";
import { writeInstances, writeStartupInstances, writeWorldObjects } from "./instances.ts";
import { readNavigation } from "./navigation.ts";
import { readWorldObjects } from "./objects.ts";
import { readPickupModels } from "./pickup-models.ts";

export interface WorldConversionOptions {
  /** Force one UV/CLUT variant instead of selecting terrain textures by geometry detail. */
  textureVariant?: 0 | 1;
}

/** World MR consumed by the port and the shared TM3 gameplay module. */
export async function convertWorld(
  ter: Uint8Array<ArrayBuffer>,
  img: Uint8Array<ArrayBuffer>,
  options: WorldConversionOptions = {},
) {
  const variant = options.textureVariant;
  requireValue(variant === undefined || variant === 0 || variant === 1, "Invalid texture variant");
  const world = readWorld(ter, img);
  const { terrain } = world;
  // TM4's RenderScratch projects at most 96 vertices per visible detail group.
  for (const [square, groups] of terrain.squares.entries())
    for (const [detail, group] of groups.entries())
      requireValue(
        !group.faces.length || group.vertex_count <= 96,
        `Square ${square}, detail ${detail}: ${group.vertex_count} vertices exceed TM4's limit of 96`,
      );
  validateWorldTextures(world);
  const source = at(world.blocks, 0).bytes;
  const root = directory();
  function section(name: string) {
    const section = terrain.sections.find((section) => section.name === name);
    requireValue(section, `Missing terrain section ${name}`);
    return source.subarray(section.offset, section.offset + section.size);
  }
  function put(path: string, bytes: Uint8Array<ArrayBuffer>, type = 3, arraySize = 65535) {
    const parts = ("world/" + path).split("/"),
      name = parts.pop()!;
    let node: MrDirectory = root;
    for (const part of parts) {
      if (!node.folders.has(part)) node.folders.set(part, directory());
      node = node.folders.get(part)!;
    }
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    padded.set(bytes);
    node.files.set(name, { type, arraySize, bytes: padded });
  }
  function number(path: string, value: number, type = 4) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    put(path, bytes, type);
  }
  // TM3's spawn selector at 8004460c/80044668 ignores records with X=Z=0.
  const spawnBytes = section("spawn_records");
  const spawnView = new DataView(spawnBytes.buffer, spawnBytes.byteOffset, spawnBytes.byteLength);
  const spawns = [];
  for (let index = 0; index < 64; ++index) {
    const offset = index * 16;
    if (spawnView.getInt16(offset, true) === 0 && spawnView.getInt16(offset + 4, true) === 0)
      continue;
    spawns.push(spawnBytes.subarray(offset, offset + 16));
  }
  requireValue(spawns.length > 0, "Map has no active spawn points");
  const startpoints = new Uint8Array(spawns.length * 16);
  spawns.forEach((spawn, index) => {
    startpoints.set(spawn, index * 16);
    new DataView(startpoints.buffer).setInt16(index * 16 + 6, 0, true);
    new DataView(startpoints.buffer).setInt16(index * 16 + 14, 0, true);
  });
  put("startpoints", startpoints, 26, spawns.length);
  // SCUS_942.49 8004478C samples the current floor at X/Z and subtracts 0x60.
  number("spawnGroundClearance", 96);
  const animationRecords = section("animation_records_raw");
  const animationPixels = section("animation_pixels_raw");
  const animationCount = new DataView(source.buffer, source.byteOffset).getUint16(0x2830, true);
  const animations = readTextureAnimations(animationRecords, animationPixels, animationCount);
  put("animInfo/tarData", animationRecords);
  put("animInfo/tadData", animationPixels);
  number("animInfo/numTar", animations.length);
  const horizonSource = at(world.blocks, 4).bytes;
  const horizon = readHorizon(horizonSource);
  if (horizon) put("horiz.bin", horizonSource.slice(0, horizon.size));
  if (at(world.blocks, 7).bytes.length) {
    put("tm3WeaponMarkers", section("position_records"), 5, 128);
    put("weaponSet", new TextEncoder().encode("Tm3WorldWeapons\0"), 2);
    put("contactEffects", new TextEncoder().encode("Tm3ContactEffects\0"), 2);
    put("teleportEffect", new TextEncoder().encode("Tm3TeleportEffect\0"), 2);
    put("pickupRules", new TextEncoder().encode("Tm3WorldPickups\0"), 2);
  }
  const records = readWorldObjects(world);
  const mapWeapons = new Set(
    records.flatMap((record) =>
      record.kind === "pickup" && record.pickup?.tm4Type === "proximity"
        ? [record.pickup.name]
        : [],
    ),
  );
  requireValue(mapWeapons.size <= 1, "Conflicting map weapons share the Proximity inventory slot");
  const [mapWeapon] = mapWeapons;
  if (mapWeapon) put("tm3MapWeapon", new TextEncoder().encode(mapWeapon + "\0"), 2);
  for (const { name, type, mesh } of readPickupModels(at(world.blocks, 5).bytes))
    if (type !== "proximity" || name === mapWeapon) put("pickupModels/" + type, mesh);
  const decorations = directory();
  const props = directory();
  const textureSection = terrain.sections.find((entry) => entry.name === "textures")!;
  function shaderIndex(address: number) {
    const offset =
      address >= 0x1f800340 && address < 0x1f800400
        ? address - 0x1f800340
        : address - textureSection.offset;
    requireValue(
      offset >= 0 && offset % 24 === 0 && offset + 24 <= textureSection.size,
      "Object texture outside world shader bank",
    );
    return offset / 12 + (variant ?? 0);
  }
  function bindMesh(data: Uint8Array, offset: number, count: number) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0; i < count; ++i) {
      const face = offset + i * 52;
      requireValue(
        data[face + 35] === 0x34 || data[face + 35] === 0x3c,
        "Unexpected map object primitive",
      );
      view.setUint32(face + 48, shaderIndex(view.getUint32(face + 48, true)), true);
    }
  }
  for (const object of records) {
    if (object.kind !== "decoration" && object.kind !== "prop") continue;
    const data = object.bytes.slice();
    const view = new DataView(data.buffer);
    const instance = directory();
    const name = "tm3_" + object.offset.toString(16);
    if (object.kind === "decoration") {
      requireValue(data[46]! <= 2, "Unknown decorative quad mode");
      view.setUint32(52, shaderIndex(object.texture), true);
      instance.files.set("quad", binary(data));
      decorations.folders.set(name, instance);
    } else {
      requireValue(
        object.motion <= 2 && (object.motion !== 2 || view.getUint16(16, true) !== 0),
        "Invalid prop movement parameters",
      );
      bindMesh(data, 28, object.quads);
      instance.files.set("mesh", binary(data));
      props.folders.set(name, instance);
    }
  }
  writeStartupInstances(root, "tm3Decoration", decorations);
  writeStartupInstances(root, "tm3Prop", props);
  const transitions = directory();
  const transitionFaces = section("trailing_records_52");
  const destroyables = convertDestroyables(
    terrain,
    new Binary(section("destruction_groups")),
    new Binary(section("destruction_face_offsets")),
    (stage, group, name) => {
      const first = stage.u16(12),
        count = stage.u8(10);
      requireValue(
        count && (first + count) * 52 <= transitionFaces.length,
        "Destruction animation mesh outside terrain",
      );
      // The only rotating transition on disc has a horizontal target forward axis.
      requireValue(
        !(stage.u8(8) & ~3) && (!(stage.u8(8) & 1) || stage.i16(34) === 0),
        "Unsupported destruction rotation axis",
      );
      const mesh = transitionFaces.slice(first * 52, (first + count) * 52);
      bindMesh(mesh, 0, count);
      const instance = directory();
      const id = new Uint8Array(4);
      new DataView(id.buffer).setUint32(0, group, true);
      instance.files.set("group", binary(id));
      instance.files.set("motion", binary(stage.bytes.slice(0, 56)));
      instance.files.set("mesh", binary(mesh));
      transitions.folders.set(name, instance);
    },
  );
  writeInstances(root, "tm3Transition", "released", transitions);
  const instances = writeWorldObjects(root, records, destroyables.startup);
  writeStartupInstances(root, "destroyable", destroyables.startup);
  const navigation = readNavigation(at(world.blocks, 3).bytes);
  {
    const settings = at(world.blocks, 2).bytes;
    requireValue(!settings.length || settings.length === 312, "Invalid TM3 world settings");
    const view = new DataView(settings.buffer, settings.byteOffset, settings.byteLength);
    if (at(world.blocks, 7).bytes.length) {
      // Class 20 reads these three channels at 80037c9c. Empty block 2 uses the EXE defaults.
      const flash = new Uint8Array(8);
      flash.set(settings.length ? settings.subarray(0x15, 0x18) : [255, 120, 120]);
      put("screenFlash", flash, 18, flash.length);
      put("fragmentImpact", new TextEncoder().encode("Tm3FragmentImpact\0"), 2);
    }
    if (settings.length) {
      // 8003d408 paints the background tile. 8003db70 selects the face budgets per viewport.
      const render = new Uint8Array(20);
      render.set(settings.subarray(0, 3));
      render.set(settings.subarray(0x12c, 0x134), 12);
      put("renderSettings", render, 18, render.length);
    }
    // TM3 0x80048834 selects block 2 or the defaults at 0x8007b918.
    number("ai/powerupRegenRate", settings.length ? view.getInt16(0x10e, true) : 4096, 13);
    number("ai/healthRegenRate", settings.length ? view.getInt16(0x10c, true) : 2048, 13);
    number("ai/aiEnabledFlag", navigation.nodes ? 1 : 0, 11);
    put("ai/worldData", navigation.image, 17);
    const factors = new Uint8Array(12);
    const factorsView = new DataView(factors.buffer);
    factorsView.setInt32(4, 2048, true);
    factorsView.setInt32(8, 4096, true);
    put("ai/difficultyFactorArray", factors, 21, 3);
    number("ai/fireDelayRate", settings.length ? view.getInt16(0x108, true) : 4096, 13);
    number("ai/fireDelayAiToAiRate", settings.length ? view.getInt16(0x10a, true) : 4096, 13);
    // 80019ac8 sets the health fraction and the number of cars allowed to target
    // a human. Non-tournament matches use fixed limits in the executable.
    number("ai/healthThresholdEasy", settings.length ? view.getInt16(0x122, true) : 0, 13);
    number("ai/healthThresholdHard", settings.length ? view.getInt16(0x126, true) : 0, 13);
    number("ai/numCarsToTargetHumanEasy", settings.length ? settings[0x11c]! : 1);
    number("ai/numCarsToTargetHumanHard", settings.length ? settings[0x120]! : 2);
    number("ai/dmHealthThresholdEasy", 0, 13);
    number("ai/dmHealthThresholdHard", 0x4cd, 13);
    number("ai/dmNumCarsToTargetHumanEasy", 1);
    number("ai/dmNumCarsToTargetHumanHard", 2);
    for (const key of ["hyperspaceLevel", "hyperspaceNumEasy", "hyperspaceNumHard"])
      number("ai/" + key, 0);
    // World sector records at +0x18 multiply the CAR sector weights (8001991c).
    // TM4 indexes weapons by CarWeaponNames. Map only matching inventory columns.
    const inventory = [
      14,
      0,
      2,
      1,
      4,
      9,
      7,
      8,
      5,
      6,
      null,
      13,
      mapWeapon === "Eye" ? 11 : mapWeapon === "Radar" ? 10 : mapWeapon === "Spaceship" ? 12 : null,
      3,
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    for (let sector = 0; sector < 12; sector++) {
      const path = `ai/sectors/${sector}/`,
        record = 0x18 + sector * 20;
      number(path + "order", sector);
      number(path + "sectorProb", settings.length ? view.getInt32(record, true) : 100);
      const weights = Uint8Array.from(inventory, (slot) =>
        slot === null ? 0 : settings.length ? settings[record + 4 + slot]! : 100,
      );
      put(path + "weapProbArray", weights, 18, weights.length);
    }
  }
  // Both engines use 64x64 cells, signed X/Z >> 10, with origin at cell 32.
  // The serialized square layout is identical; its seven pointer slots are not data.
  const squares = new Uint8Array(section("squares"));
  for (let offset = 0; offset < squares.length; offset += 56)
    squares.fill(0, offset + 12, offset + 40);
  put("squares/gridData", section("grid"));
  put("squares/squareData", squares);
  number("squares/numSquares", terrain.squares.length);

  const shaders = section("textures");
  const texturesStart = terrain.sections.find((section) => section.name === "textures")!.offset;
  const faces = new Uint8Array(section("faces"));
  const facesStart = terrain.sections.find((section) => section.name === "faces")!.offset;
  const faceView = new DataView(faces.buffer);
  // Group face offsets are relative to the stream and can be shared across squares.
  const farOnly = new Set(terrain.squares.flatMap((groups) => at(groups, 1).faces));
  for (const groups of terrain.squares)
    for (const offset of at(groups, 0).faces) farOnly.delete(offset);
  for (const face of Object.values(terrain.faces)) {
    const offset = face.offset - facesStart;
    const textureVariant = variant ?? Number(farOnly.has(offset));
    faceView.setUint32(
      offset + face.size - 4,
      face.texture - texturesStart + textureVariant * 12,
      true,
    );
  }
  put("displayPolys/faceData", faces);
  put("displayPolys/shaderData", shaders);
  put("displayPolys/vertexData", section("vertices"));
  number("displayPolys/numWorldFaces", Object.keys(terrain.faces).length);
  number("displayPolys/numWorldVertices", terrain.vertices.length);
  number("displayPolys/numPsxShaders", shaders.length / 12);

  const sourceSurfaces = section("unknown_records_32");
  requireValue(sourceSurfaces.length > 0, "Map has no surface table");
  const surfaceCount = sourceSurfaces.length / 32;
  const surfaces = new Uint8Array(sourceSurfaces.length);
  for (let index = 0; index < surfaceCount; ++index) {
    const kind = at(sourceSurfaces, index * 32);
    requireValue(kind <= 8, "Unsupported TM3 surface kind");
    surfaces[index * 32] = kind;
  }
  // TM4 prepends a 32-bit owner to TM3's 76-byte polygon. Preserve XYZ and
  // enable/count flags, but never interpret TM3 destruction IDs as TM4 metadata.
  const collisions = new Uint8Array(terrain.collisions.length * 80);
  const sourceCollisions = section("collision_records");
  const collisionView = new DataView(collisions.buffer);
  for (let i = 0; i < terrain.collisions.length; ++i) {
    const offset = i * 80;
    const material = at(at(terrain.collisions, i).vertices_raw, 1)[3]!;
    requireValue(material >= 0 && material < surfaceCount, "Collision surface outside table");
    collisions.set(sourceCollisions.subarray(i * 76, (i + 1) * 76), offset + 4);
    // Only vertex count, material and enabled have TM4 consumers; unused pads are zero.
    for (let vertex = 0; vertex < 4; ++vertex) {
      if (vertex > 1) collisionView.setInt16(offset + 16 + vertex * 8 + 6, 0, true);
      if (vertex !== 0) collisionView.setInt16(offset + 48 + vertex * 8 + 6, 0, true);
    }
  }
  put("collisionPolys/faceData", collisions);
  put("collisionPolys/indexData", section("collision_indices"));
  number("collisionPolys/numCollideInList", terrain.collisions.length);
  number("collisionPolys/numCollideInIndex", terrain.collision_indices.length);
  // Kind is a signed byte in both engines (TM3 800203bc); 7 is fall-to-death,
  // 8 is melt (80018434/8001843c). Effects in the rest of TM3's record differ.
  put("trackCrap/data", surfaces);
  // Wheel mark and particle UV rectangles follow the 200-byte map texture header.
  const atlas = at(world.blocks, 1).bytes;
  if (atlas.length > 200 && at(world.blocks, 7).bytes.length) {
    const tiles = Math.floor((atlas.length - 200) / 8);
    for (let i = 0; i < sourceSurfaces.length; i += 32) {
      for (const offset of [4, 11, 18, 25]) {
        if (!sourceSurfaces[i + offset]) continue;
        const first = at(sourceSurfaces, i + offset + 2);
        const count = at(sourceSurfaces, i + offset + 3);
        requireValue(count > 0 && first + count <= tiles, "Invalid surface effect texture range");
      }
    }
    put("wheelSurfaceClass", new TextEncoder().encode("tm3WheelSurface\0"), 2);
    put("wheelMaterials", sourceSurfaces);
    put("wheelAtlas", atlas.slice(200, 200 + tiles * 8));
  }
  number("trackCrap/numRoadTypes", surfaceCount);
  // Keep the source VRAM in its own bank: TM3's uploads overlap TM4's HUD.
  const pixels = new Uint8Array(1024 * 512 * 2);
  const pixelView = new DataView(pixels.buffer);
  for (const rectangle of world.vram.rectangles)
    for (let y = 0; y < rectangle.height; ++y)
      for (let x = 0; x < rectangle.width; ++x)
        pixelView.setUint16(
          ((rectangle.y + y) * 1024 + rectangle.x + x) * 2,
          at(rectangle.words, y * rectangle.width + x),
          true,
        );
  // The shared pack supplies two RGB5551 tiles in the unused top half of the world bank.
  requireValue(
    world.vram.rectangles.every(({ x, y, width }) => y >= 64 || x >= 768 || x + width <= 640),
    "World image overlaps car reflection textures",
  );
  put("textureBankOverlay", new TextEncoder().encode("/resourcePacks/tm3/reflections.bit\0"), 2);
  for (const [u, name] of [
    [0, "reflchro"],
    [64, "reflspec"],
  ] as const)
    put(`textures/${name}`, Uint8Array.of(u, 0, 0, 0, u + 63, 63, 10, 1));
  put("textureBank", pixels);
  async function hash(bytes: Uint8Array<ArrayBuffer>) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }
  const metadata = {
    ter_sha256: await hash(ter),
    img_sha256: await hash(img),
    texture_variant: variant ?? "by-detail",
    startpoints: spawns.length,
    navigation_nodes: navigation.nodes,
    navigation_links: navigation.links,
    texture_animations: animations.length,
    decorations: decorations.folders.size,
    moving_props: props.folders.size,
    animated_destruction_groups: transitions.folders.size,
    horizon_polygons: horizon ? horizon.gouraud + horizon.flat + horizon.textured : 0,
    ...instances,
    destroyables: destroyables.startup.folders.size,
    omitted_destruction_groups: destroyables.omitted,
    squares: terrain.squares.length,
    faces: Object.keys(terrain.faces).length,
    vertices: terrain.vertices.length,
    collisions: terrain.collisions.length,
    object_types: terrain.objects.reduce<Record<number, number>>((types, object) => {
      types[object.type] = (types[object.type] ?? 0) + 1;
      return types;
    }, {}),
    limitations: [
      "Requires separate map registration and the shared TM3 module.",
      "Terrain UV variants are assigned at conversion. Texture animation uses the TM4 player.",
      "Original map ambience and CD audio playback are unverified.",
      "AI uses TM4 decision logic and difficulty interpolation.",
      "Visual and audio parity with an original console capture remains unverified.",
    ],
  };
  return {
    root,
    archive: writeMr(root),
    imageArchive: writeMr(directory()),
    metadata,
  };
}
