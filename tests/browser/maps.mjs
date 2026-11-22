/* global Module, tm4Port, getWasmTableEntry */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { mapBehaviors } from "../../apps/build-maps/src/behavior.ts";
import { maps } from "../../apps/build-maps/src/catalog.ts";
import { readMr } from "../../external/rusty-metal-4/packages/resources/src/compatibility/mr.ts";
import { prepareFixture, prepareMapFixture, weaponSlots } from "./fixture.mjs";
import { checkFragmentEffects } from "./helpers/fragment-effects.mjs";
import { checkObjectLifecycle } from "./helpers/object-lifecycle.mjs";
import { checkScreenFlash } from "./helpers/screen-flash.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    map: { type: "string", multiple: true },
    maps: { type: "string", default: "build/maps" },
    shared: { type: "string", default: "build/TM3.MR" },
    cars: { type: "string", default: "build/checks/cars" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    output: { type: "string", default: "build/checks/maps" },
  },
});
if (!values.disc) throw Error("Supply --disc TM4_DISC_DIRECTORY");
for (const id of values.map ?? [])
  if (!maps.some((map) => map.id === id)) throw Error("Unknown map " + id);
const mods = resolve(values.output, "fixture");
await prepareFixture(mods, values.shared, values.cars);
for (const map of maps.filter((map) => !values.map || values.map.includes(map.id))) {
  const output = resolve(values.output, map.id);
  const root = (
    await readMr(
      new Uint8Array(await Bun.file(resolve(values.maps, map.file + ".MR")).arrayBuffer()),
    )
  ).root;
  const behavior = mapBehaviors[map.id];
  const module = behavior?.module;
  const mapProfile = behavior ? "tm3" + behavior.pickup : undefined;
  // Move the map weapon away from its authored position to catch numeric coupling.
  if (mapProfile) {
    const entries = root.folders.get("world").folders.get("arsenal").folders;
    const mapEntry = entries.get(mapProfile),
      other = entries.get("freeze");
    const order = mapEntry.files.get("order");
    mapEntry.files.set("order", other.files.get("order"));
    other.files.set("order", order);
  }
  const slots = weaponSlots(root);
  const { site, archive } = prepareMapFixture(root, module, values.site);
  const world = root.folders.get("world");
  assert.ok(root.folders.get("objects").folders.has("tm3WorldWeapons"));
  const markers = world.files.get("tm3WeaponMarkers").bytes;
  let anchors = 0;
  const marker = map.id === "north-pole" ? 3 : 5;
  for (let i = 6; i < markers.length && markers[i]; i += 8) if (markers[i] === marker) anchors++;
  const props =
    root.folders
      .get("objects")
      ?.folders.get("tm3Prop")
      ?.folders.get("instances")
      ?.folders.get("startup")?.folders.size ?? 0;
  const fixture = await openTm3Car({
    disc: values.disc,
    site,
    mods,
    output,
    world: {
      stem: "tm3map",
      archive,
      imageArchive: new Uint8Array(
        await Bun.file(resolve(values.maps, map.file + ".IMG")).arrayBuffer(),
      ),
    },
    playerCars: map.id === "egypt" ? ["Crusher", "Crusher"] : undefined,
    cars: [{ stem: "mtm3sw", title: "TM3 Sweet Tooth", directory: "tm3sweet", file: "SWEET.MR" }],
  });
  try {
    const result = await fixture.page.evaluate(
      async ({ id, module, anchors, props, slots, mapProfile }) => {
        if (
          module &&
          !Module.ccall("WebNativeModuleLoaded", "number", ["string"], [module + ".sym"])
        )
          throw Error("Map module was not loaded");
        const checkMapWeaponWeights = () => {
          if (!mapProfile) return;
          const fn = Module.ccall(
            "WebDynamicModuleExport",
            "number",
            ["string", "string"],
            ["mtm3fx.sym", "Tm3TestWeaponProfiles"],
          );
          if (!fn) throw Error("Build shared with --test-hooks");
          Module._WebCheckpointArenaSelect(1);
          try {
            for (let sector = 0; sector < 12; ++sector)
              if (getWasmTableEntry(fn)(12, slots[mapProfile], sector) !== 0)
                throw Error("Map weapon inherited a non-TM3 AI weight");
          } finally {
            Module._WebCheckpointArenaSelect(0);
          }
        };
        checkMapWeaponWeights();
        const count = (name) => {
          Module.ccall("WebTestSnapshotObjects", null, ["string"], [name]);
          return tm4Port.testSnapshotObjects.length;
        };
        if (count("tm3Prop") !== props) throw Error("Map props failed to initialize");
        let tick = 0;
        function step(buttons = 0) {
          for (let slot = 0; slot < 2; slot++)
            if (!Module._WebNetSetInput(tick, slot, slot ? 0 : buttons, 0, 0))
              throw Error("Input rejected at " + tick);
          if (!Module._WebNetQueueTick(tick++) || tm4Port.netMatch.tick !== tick)
            throw Error("Tick did not advance");
          if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
        }
        while (tick < 117) step();
        if (id === "egypt" || id === "tokyo") {
          if (Module._WebTestEquipWeapon(slots[mapProfile]) !== 10)
            throw Error("Cannot equip map weapon");
        }
        if (id === "hollywood" && Module._WebTestEquipWeapon(slots.tm3Remote) !== 5)
          throw Error("Cannot equip Remote");
        if (id === "north-pole" && Module._WebTestEquipWeapon(slots.tm3Lightning) !== 10)
          throw Error("Cannot equip Lightning");
        step(id === "egypt" || id === "hollywood" ? 1 : 0);
        while (tick < 120) step();
        if (id === "egypt" && count("tm3Eye") !== 1) throw Error("Eye marker was not placed");
        if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
          throw Error(tm4Port.localCheckpointError || tm4Port.portableCheckpointError);
        const snapshot = tm4Port.portableCheckpoint.slice();
        if (id === "hollywood" && count("tm3Remote") !== 1) throw Error("Remote was not placed");
        const run = () => {
          checkMapWeaponWeights();
          tick = 120;
          let debris = false,
            reward = false,
            previousFlash;
          const states = [];
          while (tick < (id === "hangar-18" ? 245 : 145)) {
            const t = tick;
            if (id === "hangar-18" && t === 120) {
              if (
                !Module.ccall(
                  "WebTestAimAtWorldObject",
                  "number",
                  ["string", "number"],
                  ["tm3Prop", 420],
                ) ||
                !Module._WebTestEquipWeapon(slots.tm3Power)
              )
                throw Error("Cannot aim at saucer");
            }
            if (
              id === "hangar-18" &&
              t === 123 &&
              Module._WebTestEquipWeapon(slots[mapProfile]) !== 10
            )
              throw Error("Cannot equip Spaceship");
            step(
              (["egypt", "tokyo", "hollywood", "north-pole"].includes(id) && t === 121) ||
                (id === "hangar-18" && (t === 120 || t === 123))
                ? 1
                : 0,
            );
            if ((id === "egypt" || id === "tokyo") && t === 121) {
              if (count("tm3ScreenFlash") !== 1) throw Error("Missing beam flash object");
              if (count("tm3MapBeam") !== 1) throw Error("Missing map beam");
              if (id === "egypt" && count("tm3Eye")) throw Error("Eye marker survived firing");
              for (const [pitch, attached] of [
                [1180, 1],
                [1308, 0],
              ])
                if (
                  Module.ccall(
                    "WebTestCountSoundVoices",
                    "number",
                    ["string", "number", "number"],
                    ["tm3_s14", pitch, attached],
                  ) !== 1
                )
                  throw Error("Missing beam voice");
            }
            if ((id === "egypt" || id === "tokyo") && t >= 121 && t <= 123) {
              const flash = getWasmTableEntry(
                Module.ccall(
                  "WebDynamicModuleExport",
                  "number",
                  ["string", "string"],
                  ["mtm3fx.sym", "Tm3TestScreenFlash"],
                ),
              )();
              if (flash < 0) throw Error("Missing map flash");
              const rgb = [flash & 255, (flash >>> 8) & 255, (flash >>> 16) & 255];
              if (previousFlash && rgb.some((v, i) => v !== Math.max(0, previousFlash[i] - 12)))
                throw Error("Map flash did not fade");
              previousFlash = rgb;
            }
            if (id === "hollywood" && t === 121 && (count("tm3Remote") || !count("tm3Explosion")))
              throw Error("Remote did not detonate");
            if (
              id === "north-pole" &&
              t === 122 &&
              (!anchors || count("tm3OutlawEmitter") !== anchors || count("tm3ScreenFlash") !== 1)
            )
              throw Error("Lightning emitter count differs");
            if (id === "hangar-18") {
              if (
                t === 125 &&
                (!anchors || count("tm3OutlawEmitter") !== anchors || count("tm3ScreenFlash") !== 1)
              )
                throw Error("Spaceship emitter count differs");
              debris ||= count("tm3Debris") > 0;
              reward ||=
                Module.ccall(
                  "WebTestCountSoundVoices",
                  "number",
                  ["string", "number", "number"],
                  ["tm3_s32", 1308, 0],
                ) > 0;
            }
            if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
            states.push(Array.from(tm4Port.netCapturedState));
          }
          if (id === "hangar-18" && (!reward || !debris || count("tm3Prop")))
            throw Error("Saucer destruction/reward failed");
          return states;
        };
        const expected = run();
        if (!Module._WebNetRestoreLocalCheckpoint()) throw Error(tm4Port.localCheckpointError);
        const rollback = run();
        if (!Module._WebNetFinishLocalReplay()) throw Error(tm4Port.localCheckpointError);
        if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
          throw Error("Restart failed");
        Module._WebNetEndReplay();
        tm4Port.portableCheckpoint = snapshot;
        if (!Module._WebNetBeginPortableReplay()) throw Error(tm4Port.portableCheckpointError);
        Module._WebNetEndReplay();
        const portable = run();
        const mapChanges = [];
        if (id === "hollywood") {
          for (const world of [1, 0]) {
            await Module.ccall("WebNetCancelMatch", null, [], [], { async: true });
            const started = await Module.ccall(
              "WebNetStartFfa",
              "number",
              [
                "number",
                "number",
                "number",
                "number",
                "number",
                "number",
                "string",
                "string",
                "number",
                "string",
                "number",
                "number",
                "number",
              ],
              [
                8,
                3,
                world,
                12345,
                0,
                3,
                "Crusher\nCrusher",
                "0000000000000001\n0000000000000002",
                90,
                "Crusher",
                27000,
                20,
                0,
              ],
              { async: true },
            );
            if (!started) throw Error("Map change failed: " + JSON.stringify(tm4Port.netSession));
            const equip = (id) =>
              Module.ccall("WebTestEquipWeaponProfile", "number", ["string"], [id]);
            const capacities = [
              equip(world ? "power" : "tm3Power"),
              equip(world ? "remote" : "tm3Remote"),
            ];
            if (capacities[0] !== (world ? 6 : 5) || capacities[1] !== (world ? 4 : 5))
              throw Error("Weapon parameters leaked across maps: " + capacities);
            if (!equip(world ? "fire" : "tm3Fire"))
              throw Error("Cannot equip Fire after map change");
            tick = 0;
            while (tick < 15) step();
            const stockShots = tm4Port.projectileSpawns || 0;
            step(1);
            if (world ? (tm4Port.projectileSpawns || 0) <= stockShots : !count("tm3Missile"))
              throw Error("Wrong launcher after map change");
            if (world && count("tm3Missile")) throw Error("TM3 projectile on stock map");
            mapChanges.push({ world, capacities });
          }
        }
        return { expected, rollback, portable, snapshotBytes: snapshot.length, mapChanges };
      },
      { id: map.id, module, anchors, props, slots, mapProfile },
    );
    await Bun.write(resolve(output, "result.json"), JSON.stringify(result, null, 2));
    assert.deepEqual(result.rollback, result.expected, map.id + " rollback");
    assert.deepEqual(result.portable, result.expected, map.id + " portable restore");
    if (map.id === "tokyo") await checkScreenFlash(fixture.page);
    if (map.id === "egypt") await checkFragmentEffects(fixture.page);
    await checkObjectLifecycle(fixture.page, {
      module,
      props,
      car: map.id === "egypt" || map.id === "hollywood" ? "Crusher" : "TM3 Sweet Tooth",
    });
    assert.ok(!fixture.log.some((line) => /PAGEERROR|Aborted|RuntimeError/.test(line)));
    console.log("PASS", map.id, module ?? "shared mechanisms");
  } finally {
    await fixture.close();
  }
}
