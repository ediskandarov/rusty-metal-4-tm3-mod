/* global Module, tm4Port, HEAPU8, HEAPU16 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { convertWorld } from "@rusty-metal-4/tm3-resources";
import { readMr } from "@tm4/resources/compatibility/mr";

import { mapBehaviors } from "../../apps/build-maps/src/behavior.ts";
import { maps } from "../../apps/build-maps/src/catalog.ts";
import { prepareFixture, prepareMapFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";
const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    "tm3-disc": { type: "string" },
    map: { type: "string" },
    bot: { type: "boolean" },
    "stock-car": { type: "boolean" },
    "check-lightning": { type: "string" },
    "check-transition": { type: "boolean" },
    "shoot-prop": { type: "boolean" },
    "check-map-weapon": { type: "string" },
    "check-rain": { type: "boolean" },
    "check-remote": { type: "boolean" },
    "check-weapons": { type: "boolean" },
    "drop-hits": { type: "string" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    mods: { type: "string", default: "build/checks/fixture" },
    output: { type: "string", default: "build/checks/tm3-world" },
  },
  strict: true,
});
if (!values.disc || !values.map || !values["tm3-disc"])
  throw Error("--disc TM4_DISC --tm3-disc TM3_DISC --map MAP_ID required");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const mapWeapon = values["check-map-weapon"];
assert.ok(!mapWeapon || ["Radar", "Eye"].includes(mapWeapon));
const map = maps.find((map) => map.id === values.map);
if (!map) throw Error("Unknown map " + values.map);
const disc = await openDataDisc(values["tm3-disc"]);
const tm4 = await openDataDisc(values.disc);
const game = await readMr(await tm4("/DATA/GAME.MR"));
const converted = await convertWorld(
  await disc("/WORLDS/" + map.file + ".TER"),
  await disc("/WORLDS/" + map.file + ".IMG"),
  { powerupResources: game.directories.get("Root/objects/powerup") },
);
const built = (
  await readMr(
    new Uint8Array(await Bun.file(resolve("build/maps", map.file + ".MR")).arrayBuffer()),
  )
).root;
const prepared = prepareMapFixture(built, mapBehaviors[map.id]?.module, resolve(values.site));
const session = await openTm3Car({
  disc: values.disc,
  site: prepared.site,
  mods: resolve(values.mods),
  output: resolve(values.output),
  world: {
    stem: "tm3hwd",
    archive: prepared.archive,
    imageArchive: converted.imageArchive,
  },
  botSlots: values.bot ? 2 : 0,
  playerCars: values["stock-car"] ? ["Crusher"] : undefined,
  cars: values["stock-car"]
    ? []
    : [
        {
          stem: "mtm3sw",
          title: "TM3 Sweet Tooth",
          directory: "tm3sweet",
          file: "SWEET.MR",
        },
      ],
});
try {
  const reflections = await session.page.evaluate(() =>
    [Module._WorldReflectionTextureChrome, Module._WorldReflectionTextureSpecular].map((ptr) => {
      const page = HEAPU16[(ptr + 6) >>> 1];
      return { u: HEAPU8[ptr], page: page & 0x1ff, bank: (page >>> 9) & 15 };
    }),
  );
  assert.ok(reflections[0].bank > 0, "Shield chrome sampled framebuffer VRAM");
  assert.deepEqual(
    reflections,
    [0, 64].map((u) => ({ u, page: 0x12a, bank: reflections[0].bank })),
  );
  const before = await session.page.evaluate(() => ({
    tick: tm4Port.netMatch.tick,
    car: tm4Port.car,
    position: [Module._WebTestCarResource(0, 3) | 0, Module._WebTestCarResource(0, 4) | 0],
    failure: globalThis.failure,
    props:
      (Module.ccall("WebTestSnapshotObjects", null, ["string"], ["tm3Prop"]),
      tm4Port.testSnapshotObjects.length),
    decorations:
      (Module.ccall("WebTestSnapshotObjects", null, ["string"], ["tm3Decoration"]),
      tm4Port.testSnapshotObjects.length),
  }));
  console.log("WORLD BEFORE", JSON.stringify(before));
  assert.equal(before.props, converted.metadata.moving_props);
  assert.equal(before.decorations, converted.metadata.decorations);
  const initialHeight = await session.page.evaluate(() => {
    const x = Module._WebTestCarResource(0, 3),
      z = Module._WebTestCarResource(0, 4);
    Module._WebTestReadEnergyActions();
    return { ground: Module._WorldGetHeight(x, z), y: tm4Port.energyAction.y };
  });
  assert.notEqual(initialHeight.ground, 0x4000, "Spawn has no supporting collision surface");
  assert.equal(initialHeight.y, initialHeight.ground - 96, "Spawn clearance over the live surface");
  const wheelEffects = await session.page.evaluate(
    async ({ teleporters, checkWeapons, checkRemote, checkRain, mapWeapon, checkTransition }) => {
      const peaks = { tm3TireMark: 0, tm3SurfaceParticle: 0 };
      Module.ccall("WebTestSnapshotObjects", null, ["string"], ["tm3WheelSurface"]);
      if (!tm4Port.testSnapshotObjects.length) throw Error("Missing wheel surface tracker");
      let destination;
      if (teleporters) {
        if (!Module._WebTestApproachLevelTrigger(0, 1)) throw Error("Missing converted teleporter");
        destination = tm4Port.testTeleportDestination.slice();
      }
      const position = () => [
        Module._WebTestCarResource(0, 3) | 0,
        Module._WebTestCarResource(0, 4) | 0,
      ];
      const driveTick = destination ? 3 : 0;
      let driveStart,
        carHandle,
        drove = false;
      for (let tick = 0; tick < 120; ++tick) {
        if (checkTransition && tick >= 71 && tick <= 73) Module._WebTestHitSceneryWithEvent(1);
        const weapon =
          checkWeapons &&
          [
            [1, 10],
            [3, 10],
            [2, 5],
            [6, 30],
            [4, 10],
            [5, 10],
            [9, 3],
          ][(tick - 10) / 16];
        const previousMissiles =
          weapon &&
          (() => {
            Module.ccall("WebTestSnapshotObjects", null, ["string"], ["tm3Missile"]);
            return tm4Port.testSnapshotObjects;
          })();
        if (weapon && Module._WebTestEquipWeapon(weapon[0]) !== weapon[1])
          throw Error("Incorrect ammo capacity for weapon " + weapon[0]);
        const placeMine = checkRemote && tick === 117;
        if (mapWeapon && tick === 117 && Module._WebTestEquipWeapon(12) !== 10)
          throw Error("Map weapon unavailable");
        const placeEye = mapWeapon === "Eye" && tick === 117;
        const launchRain = checkRain && tick === 117;
        if (launchRain && Module._WebTestEquipWeapon(7) !== 10)
          throw Error("Incorrect Rain capacity");
        if (placeMine && Module._WebTestEquipWeapon(8) !== 5)
          throw Error("Incorrect Remote capacity");
        if (tick === driveTick) {
          driveStart = position();
          carHandle = Module._WebTestCarHandle(0);
          if (!carHandle) throw Error("Missing car before driving");
          if (
            destination &&
            (Math.abs(driveStart[0] - destination[0]) >= 150 ||
              Math.abs(driveStart[1] - destination[2]) >= 150)
          )
            throw Error("Converted teleporter destination differs");
        }
        if (
          !Module._WebNetSetInput(
            tick,
            0,
            (tick >= driveTick ? 64 : 0) | (weapon || placeEye || launchRain || placeMine ? 1 : 0),
            0,
            0,
          ) ||
          !Module._WebNetSetInput(tick, 1, 0, 0, 0) ||
          !Module._WebNetQueueTick(tick)
        )
          throw Error("Cannot queue tick " + tick);
        await new Promise((resolve) => setTimeout(resolve, 35));
        for (const name of Object.keys(peaks)) {
          Module.ccall("WebTestSnapshotObjects", null, ["string"], [name]);
          peaks[name] = Math.max(peaks[name], tm4Port.testSnapshotObjects.length);
        }
        if (weapon) {
          Module.ccall("WebTestSnapshotObjects", null, ["string"], ["tm3Missile"]);
          if (!tm4Port.testSnapshotObjects.some((serial) => !previousMissiles.includes(serial)))
            throw Error("Missing TM3 projectile for " + weapon[0]);
        }
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
        if (
          driveStart &&
          carHandle === Module._WebTestCarHandle(0) &&
          Module._WebTestCarResource(0, 5) > 0
        ) {
          const [x, z] = position();
          if (Math.hypot(x - driveStart[0], z - driveStart[1]) > 16) drove = true;
        }
      }
      if (!drove) throw Error("Car did not move under throttle");
      return peaks;
    },
    {
      checkTransition: values["check-transition"],
      teleporters: converted.metadata.teleporters,
      checkRemote: values["check-remote"],
      mapWeapon,
      checkRain: values["check-rain"],
      checkWeapons: values["check-weapons"],
    },
  );
  await session.page.locator("canvas").screenshot({ path: resolve(values.output, "driving.png") });
  if (mapWeapon === "Eye" && values["stock-car"] && values["check-weapons"]) {
    assert.ok(wheelEffects.tm3TireMark > 0, "Egypt drive left no tyre marks");
    assert.ok(wheelEffects.tm3SurfaceParticle > 0, "Egypt drive emitted no surface particles");
  }
  const after = await session.page.evaluate(() => ({
    tick: tm4Port.netMatch.tick,
    car: tm4Port.car,
    position: [Module._WebTestCarResource(0, 3) | 0, Module._WebTestCarResource(0, 4) | 0],
    failure: globalThis.failure,
  }));
  console.log("WORLD AFTER", JSON.stringify(after));
  assert.equal(after.failure, undefined);
  assert.ok(after.tick > before.tick);
  const dropHits = Number(values["drop-hits"] ?? 0);
  assert.ok(Number.isInteger(dropHits) && dropHits >= 0 && dropHits <= 3);
  const marker = values["check-lightning"] === undefined ? 0 : Number(values["check-lightning"]);
  assert.ok([0, 3, 5].includes(marker));
  const rawMarkers = converted.root.folders.get("world").files.get("tm3WeaponMarkers")?.bytes;
  let anchors = 0;
  for (let at = 6; marker && at < rawMarkers.length && rawMarkers[at]; at += 8)
    if (rawMarkers[at] === marker) ++anchors;
  if (marker) assert.ok(anchors, "Map has no emitters for the selected weapon");
  const replay = await session.page.evaluate(
    async ({
      dropHits,
      checkRemote,
      checkRain,
      mapWeapon,
      shootProp,
      marker,
      anchors,
      checkTransition,
    }) => {
      if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
        throw Error(
          "Checkpoint failed: " + (tm4Port.localCheckpointError || tm4Port.portableCheckpointError),
        );
      const portable = tm4Port.portableCheckpoint.slice();
      const pickupCount = () => {
        Module.ccall("WebTestSnapshotObjects", null, ["string"], ["powerup"]);
        return tm4Port.testSnapshotObjects.length;
      };
      const countClass = (name) => {
        Module.ccall("WebTestSnapshotObjects", null, ["string"], [name]);
        return tm4Port.testSnapshotObjects.length;
      };
      const step = async (phase) => {
        if (checkRemote && countClass("tm3Remote") !== 1)
          throw Error("Missing placed Remote before " + phase);
        if (checkTransition && countClass("tm3Transition") !== 1)
          throw Error("Missing London transition during " + phase);
        const beforeDrop = pickupCount();
        let previousFlash,
          sawDebris = false,
          heardReward = false;
        for (let tick = 120; tick < (checkTransition ? 315 : shootProp ? 245 : 140); ++tick) {
          if (marker && tick === 120 && Module._WebTestEquipWeapon(marker === 3 ? 11 : 12) !== 10)
            throw Error("Cannot equip map lightning");
          if (shootProp && tick === 120) {
            if (
              !Module.ccall(
                "WebTestAimAtWorldObject",
                "number",
                ["string", "number"],
                ["tm3Prop", 420],
              ) ||
              !Module._WebTestEquipWeapon(2)
            )
              throw Error("Cannot aim at the prop");
          }
          if (tick - 120 < dropHits) {
            if (pickupCount() !== beforeDrop) throw Error("Pickup released before the final stage");
            Module._WebTestHitSceneryWithEvent(0);
          }
          if (
            !Module._WebNetSetInput(
              tick,
              0,
              ((checkRemote || checkRain || mapWeapon) && tick === 121) ||
                ((shootProp || marker) && tick === 120)
                ? 1
                : 0,
              0,
              0,
            ) ||
            !Module._WebNetSetInput(tick, 1, 0, 0, 0) ||
            !Module._WebNetQueueTick(tick)
          )
            throw Error("Replay input rejected");
          await new Promise((resolve) => setTimeout(resolve, 35));
          if (marker && tick === 122 && countClass("tm3OutlawEmitter") !== anchors)
            throw Error("Incorrect number of map emitters in " + phase);
          if (mapWeapon && tick === 121 && countClass("tm3MapBeam") !== 1)
            throw Error("Missing " + mapWeapon + " beam in " + phase);
          if (mapWeapon && tick >= 121 && tick <= 123) {
            const color = Module._WebTestWorldFlash();
            if (color < 0) throw Error("Missing map flash during " + phase);
            const rgb = [color & 255, (color >> 8) & 255, color >> 16];
            if (
              previousFlash &&
              rgb.some((value, i) => value !== Math.max(0, previousFlash[i] - 12))
            )
              throw Error("Beam flash did not fade by 12 per tick during " + phase);
            previousFlash = rgb;
            if (tick === 121) {
              for (const [pitch, attached] of [
                [1180, 1],
                [1308, 0],
              ]) {
                if (
                  Module.ccall(
                    "WebTestCountSoundVoices",
                    "number",
                    ["string", "number", "number"],
                    ["tm3_s14", pitch, attached],
                  ) !== 1
                )
                  throw Error("Missing beam voice at pitch " + pitch + " during " + phase);
              }
            }
          }
          if (shootProp) {
            sawDebris ||= countClass("tm3Debris") > 0;
            heardReward ||=
              Module.ccall(
                "WebTestCountSoundVoices",
                "number",
                ["string", "number", "number"],
                ["tm3_s32", 1308, 0],
              ) === 1;
          }
          if (checkRain && tick === 121 && countClass("tm3RainDrop") !== 6)
            throw Error("Rain failed to split in " + phase);
          if (
            checkRemote &&
            tick === 122 &&
            (countClass("tm3Remote") || !countClass("tm3Explosion"))
          )
            throw Error("Remote did not detonate in " + phase);
        }
        if (checkTransition && countClass("tm3Transition"))
          throw Error("London transition still active");
        if (shootProp && !heardReward) throw Error("Missing saucer reward sound in " + phase);
        if (shootProp && !sawDebris) throw Error("No shards from the destroyed saucer in " + phase);
        if (shootProp && countClass("tm3Prop")) throw Error("Flying prop survived in " + phase);
        if (dropHits && pickupCount() !== beforeDrop + 1)
          throw Error(
            "Destroying scenery should release exactly one pickup (" +
              beforeDrop +
              " -> " +
              pickupCount() +
              ", " +
              phase +
              ", destroyed=" +
              tm4Port.testSceneryDamaged +
              ", scenery=" +
              JSON.stringify(tm4Port.testDestroyable) +
              ")",
          );
        if (!Module._WebNetCaptureState()) throw Error("State capture failed");
        return Array.from(tm4Port.netCapturedState);
      };
      const expected = await step("forward");
      if (!Module._WebNetRestoreLocalCheckpoint())
        throw Error("Local restore failed: " + tm4Port.localCheckpointError);
      const actual = await step("rollback");
      if (!Module._WebNetFinishLocalReplay()) throw Error("Local finish failed");
      if (
        !(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], {
          async: true,
        }))
      )
        throw Error("Restart failed");
      Module._WebNetEndReplay();
      tm4Port.portableCheckpoint = portable;
      if (!Module._WebNetBeginPortableReplay())
        throw Error("Portable restore failed: " + tm4Port.portableCheckpointError);
      Module._WebNetEndReplay();
      const restored = await step("portable");
      return { expected, actual, restored };
    },
    {
      checkTransition: values["check-transition"],
      dropHits,
      marker,
      anchors,
      mapWeapon,
      checkRain: values["check-rain"],
      shootProp: values["shoot-prop"],
      checkRemote: values["check-remote"],
    },
  );
  assert.deepEqual(replay.actual, replay.expected);
  assert.deepEqual(replay.restored, replay.expected);
  assert.ok(!session.log.some((line) => /PAGEERROR|Aborted|RuntimeError/.test(line)));
  await Bun.write(
    resolve(values.output, "result.json"),
    JSON.stringify({ metadata: converted.metadata, before, after, wheelEffects, replay }, null, 2),
  );
} finally {
  await session.close();
}
