/* global Module, tm4Port, getWasmTableEntry */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { readMr } from "@tm4/resources/compatibility/mr";
import { binary, directory, stringEntry, writeMr } from "@tm4/resources/mods/mr-writer";

import { prepareFixture, prepareMapFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";
const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    invalid: { type: "string" },
    stock: { type: "boolean" },
    "stock-car": { type: "boolean" },
  },
});
if (!values.disc) throw Error("Supply --disc");
const output = resolve(
  "build/checks/weapon-profiles",
  values.invalid ?? (values.stock ? "stock" : values["stock-car"] ? "stock-car" : "valid"),
);
const mods = resolve(output, "fixture");
await prepareFixture(mods, "build/TM3.MR", "build/checks/cars");
const root = (await readMr(new Uint8Array(await Bun.file("build/maps/WASH.MR").arrayBuffer())))
  .root;
const profiles = root.folders.get("weaponProfiles");
const pickups = root.folders.get("objects").folders.get("powerup");
const int = (v) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, v, true);
  return { ...binary(bytes), type: 4 };
};
const clone = (d) => ({ files: new Map(d.files), folders: new Map(d.folders) });
const arsenal = directory();
// A registry larger than the arsenal; no original slot names or indices.
for (let i = 0; i < 40; ++i) {
  const id = `custom${String(i).padStart(2, "0")}`;
  const source = i === 1 ? "tm3Rain" : "tm3Fire";
  const profile = clone(profiles.folders.get(source));
  profile.files.set("initial", int(3));
  profile.files.set("model", stringEntry(id));
  profiles.folders.set(id, profile);
  pickups.folders.set(id, clone(pickups.folders.get(source)));
  if (i < 19) {
    const entry = directory();
    entry.files.set("profile", stringEntry(id));
    entry.files.set("order", int(i));
    arsenal.folders.set(`entry${i}`, entry);
  }
}
const special = directory();
special.files.set("profile", stringEntry("Special"));
special.files.set("order", int(19));
arsenal.folders.set("special", special);
// Enumeration order differs from the requested order.
arsenal.folders = new Map([...arsenal.folders].reverse());
root.folders.get("world").folders.set("arsenal", arsenal);
// Categories are independent of the profile registry and original disc columns.
const categories = directory();
const bytes = (value) => ({ type: 18, arraySize: 12, bytes: new Uint8Array(12).fill(value) });
for (const [id, weight] of [
  ["test:beam", 17],
  ["test:blocked", 23],
  ["test:neutral", 19],
]) {
  const category = directory();
  category.files.set("defaultWeights", bytes(weight));
  categories.folders.set(id, category);
}
root.folders.set("weaponAiCategories", categories);
for (const [id, category] of [
  ["custom00", "test:beam"],
  ["custom02", "test:beam"],
  ["custom03", "test:blocked"],
  ["custom04", "test:neutral"],
])
  profiles.folders.get(id).files.set("aiCategory", stringEntry(category));
const worldWeights = root.folders.get("world").folders.get("ai").folders.get("weaponWeights");
worldWeights.files.set("test:beam", bytes(50));
// Explicit zero suppresses a category rather than falling back to its defaults.
const carPath = mods + "/tm3sweet/SWEET.MR";
const carRoot = (await readMr(new Uint8Array(await Bun.file(carPath).arrayBuffer()))).root;
carRoot.folders.get("ai").folders.get("weaponWeights").files.set("test:blocked", bytes(0));
await Bun.write(carPath, writeMr(carRoot));
const expectedErrors = {
  duplicate: "duplicate arsenal position",
  category: "unknown or missing AI category",
  defaults: "required for an AI category",
  weights: "expected an array of 12 bytes",
  collision: "duplicate AI category",
  legacy: "use an AI category instead of profile-local weights",
  unknown: "unknown or missing profile",
  overflow: "expected 1..20 entries",
  launcher: "missing launcher export",
  configuration: "configuration rejected by launcher",
};
if (values.invalid === "category")
  profiles.folders.get("custom00").files.set("aiCategory", stringEntry("undeclared"));
if (values.invalid === "defaults")
  categories.folders.get("test:beam").files.delete("defaultWeights");
if (values.invalid === "weights")
  categories.folders.get("test:beam").files.set("defaultWeights", { ...bytes(1), arraySize: 11 });
if (values.invalid === "collision")
  categories.folders.set("fire", categories.folders.get("test:beam"));
if (values.invalid === "legacy")
  profiles.folders.get("custom00").files.set("aiProfile", stringEntry("Fire"));
if (values.invalid === "duplicate") arsenal.folders.get("entry0").files.set("order", int(19));
if (values.invalid === "unknown")
  arsenal.folders.get("entry0").files.set("profile", stringEntry("missing"));
if (values.invalid === "overflow") arsenal.folders.set("overflow", clone(special));
if (values.invalid === "launcher")
  profiles.folders.get("custom00").files.set("launchFunc", stringEntry("MissingLauncher"));
if (values.invalid === "configuration")
  profiles.folders.get("custom00").files.set("projectile", stringEntry("MissingProjectile"));
const { site, archive } = prepareMapFixture(
  root,
  undefined,
  "external/rusty-metal-4/build/diagnostic/site",
);
let fixture;
try {
  fixture = await openTm3Car({
    disc: values.disc,
    site,
    mods,
    output,
    world: values.stock
      ? undefined
      : {
          stem: "tm3map",
          archive,
          imageArchive: new Uint8Array(await Bun.file("build/maps/WASH.IMG").arrayBuffer()),
        },
    playerCars: values.stock || values["stock-car"] ? ["Crusher"] : undefined,
    cars:
      values.stock || values["stock-car"]
        ? []
        : [{ stem: "mtm3sw", title: "TM3 Sweet Tooth", directory: "tm3sweet", file: "SWEET.MR" }],
    botSlots: 2,
  });
  if (values.invalid) throw Error("Invalid registry was accepted");
  const result = await fixture.page.evaluate(
    async ({ stock, stockCar }) => {
      const check = (ok, why) => {
        if (!ok) throw Error(why);
      };
      const slot = Module.ccall(
        "WebDynamicModuleExport",
        "number",
        ["string", "string"],
        ["mtm3fx.sym", "Tm3TestWeaponProfiles"],
      );
      check(slot, "Missing probe");
      const probe = (action, index = 0, value = 0) => {
        Module._WebCheckpointArenaSelect(1);
        try {
          return getWasmTableEntry(slot)(action, index, value);
        } finally {
          Module._WebCheckpointArenaSelect(0);
        }
      };
      check(
        stock ? probe(0) > 0 && probe(0) <= 20 : probe(0) === 20,
        "Wrong arsenal size: " + probe(0),
      );
      if (!stock) {
        check(probe(5) === 19, "Special retained its original slot");
        for (let i = 0; i < 19; i++) {
          check(probe(9, i) === i, "Profile order/lookup mismatch");
          check(probe(8, i) === 1, "Profile was not prepared");
        }
      }
      const checkCategories = () => {
        for (let sector = 0; sector < 12; sector++) {
          check(probe(12, 0, sector) === 8, "Unknown category default × map factor");
          check(probe(12, 2, sector) === 8, "Profiles sharing a category must share preferences");
          check(
            probe(12, 3, sector) === (stockCar ? 23 : 0),
            "Explicit zero must override category default",
          );
          check(probe(12, 4, sector) === 19, "Unspecified map multiplier must be 100");
        }
      };
      if (!stock) checkCategories();
      let tick = 0;
      const step = () => {
        for (let player = 0; player < 2; ++player)
          check(Module._WebNetSetInput(tick, player, 0, 0, 0), "Input rejected");
        check(
          Module._WebNetQueueTick(tick++),
          "Tick rejected: " + JSON.stringify(tm4Port.netMatch),
        );
        check(!tm4Port.netMatch.unsupported, tm4Port.netMatch.unsupported);
      };
      while (tick < 90) step();
      if (stock) {
        check(Module._WebNetCaptureLocalCheckpoint(), tm4Port.localCheckpointError);
        check(Module._WebNetCapturePortableCheckpoint(), tm4Port.portableCheckpointError);
        const snapshot = tm4Port.portableCheckpoint.slice();
        const run = () => {
          tick = 90;
          probe(3, probe(5));
          const states = [];
          while (tick < 120) {
            step();
            check(Module._WebNetCaptureState(), "Capture failed");
            states.push(Array.from(tm4Port.netCapturedState));
          }
          return states;
        };
        const expected = run();
        check(Module._WebNetRestoreLocalCheckpoint(), tm4Port.localCheckpointError);
        const rollback = run();
        check(Module._WebNetFinishLocalReplay(), tm4Port.localCheckpointError);
        check(
          await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true }),
          "Restart failed",
        );
        Module._WebNetEndReplay();
        tm4Port.portableCheckpoint = snapshot;
        check(Module._WebNetBeginPortableReplay(), tm4Port.portableCheckpointError);
        Module._WebNetEndReplay();
        return { expected, rollback, portable: run() };
      }
      probe(4, 0, 2);
      check(probe(10, 0) === 1 && probe(2, 0) === 3, "Custom pickup did not credit its profile");
      probe(4, 0, 3);
      probe(4, 1, 3);
      check(probe(3, 0) === 2, "Custom launcher failed");
      check(probe(3, 1) === 3, "Rain consumed ammo before detonation");
      check(Module._WebNetCaptureLocalCheckpoint(), tm4Port.localCheckpointError);
      check(Module._WebNetCapturePortableCheckpoint(), tm4Port.portableCheckpointError);
      const snapshot = tm4Port.portableCheckpoint.slice();
      const run = () => {
        tick = 90;
        checkCategories();
        const before = probe(2, 1);
        probe(3, 1);
        check(probe(2, 1) === before - 1, "Rain detonation charged the wrong weapon");
        check(probe(2, 7) === 3, "Original Rain slot was mutated");
        probe(3, 18);
        const states = [];
        while (tick < 120) {
          step();
          check(Module._WebNetCaptureState(), "State capture failed");
          states.push(Array.from(tm4Port.netCapturedState));
        }
        return states;
      };
      const expected = run();
      check(Module._WebNetRestoreLocalCheckpoint(), tm4Port.localCheckpointError);
      const rollback = run();
      check(Module._WebNetFinishLocalReplay(), tm4Port.localCheckpointError);
      check(
        await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true }),
        "Restart failed",
      );
      Module._WebNetEndReplay();
      tm4Port.portableCheckpoint = snapshot;
      check(Module._WebNetBeginPortableReplay(), tm4Port.portableCheckpointError);
      Module._WebNetEndReplay();
      const portable = run();
      probe(7, 0);
      check(!probe(6), "Wrong profile identity accepted");
      check(!Module._WebNetCapturePortableCheckpoint(), "Mismatched inventory was serialized");
      probe(7, 0);
      check(probe(6), "Identity did not recover");
      // Same-sized inventory, different receiving profile: restore must reject it.
      probe(11, 0);
      tm4Port.portableCheckpoint = snapshot;
      check(!Module._WebNetBeginPortableReplay(), "Snapshot restored into a different profile");
      probe(11, 0);
      Module._WebNetEndReplay();
      return { expected, rollback, portable };
    },
    { stock: values.stock, stockCar: values["stock-car"] },
  );
  assert.deepEqual(result.rollback, result.expected, "local rollback");
  assert.deepEqual(result.portable, result.expected, "fresh portable restore");
  console.log(
    values.stock
      ? "PASS original TM4 weapons and special: rollback and fresh portable restore"
      : "PASS 40 custom profiles, 20-position arsenal, pickup, firing, AI, Rain detonation, rollback and snapshot identity",
  );
} catch (error) {
  if (!values.invalid) throw error;
  const log = await Bun.file(output + "/browser.log").text();
  assert.ok(log.includes(expectedErrors[values.invalid]), log + "\n" + error);
  console.log("PASS rejected", values.invalid);
} finally {
  await fixture?.close();
}
