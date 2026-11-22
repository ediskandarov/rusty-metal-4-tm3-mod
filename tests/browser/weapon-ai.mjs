/* global Module, tm4Port, getWasmTableEntry */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { readCar, readWorld } from "@rusty-metal-4/tm3-resources";
import { readMr } from "@tm4/resources/compatibility/mr";

import { prepareFixture, prepareMapFixture, weaponSlots } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    "tm3-disc": { type: "string" },
    "stock-map": { type: "boolean" },
  },
});
if (!values.disc || !values["tm3-disc"]) throw Error("Supply --disc and --tm3-disc");
const output = resolve("build/checks/weapon-ai", values["stock-map"] ? "tm4" : "tm3");
const mods = resolve(output, "fixture");
await prepareFixture(mods, "build/TM3.MR", "build/checks/cars");
const source = await openDataDisc(values["tm3-disc"]);
const columns = {
  tm3Fire: 0,
  tm3Homing: 1,
  tm3Power: 2,
  Freeze: 3,
  tm3Napalm: 4,
  tm3Remote: 5,
  tm3Ricochet: 6,
  tm3Speed: 7,
  tm3Rain: 8,
  tm3Mortar: 9,
  tm3Radar: 10,
  tm3Eye: 11,
  tm3Spaceship: 12,
  tm3Lightning: 13,
  Special: 15,
};
const parameters = await Promise.all(
  ["SWEET", "AUGER"].map(async (name) => readCar(await source(`/CARS/${name}.CAR`)).parameters),
);
const settings = readWorld(await source("/WORLDS/WASH.TER"), await source("/WORLDS/WASH.IMG"))
  .blocks[2].bytes;
const root = (await readMr(new Uint8Array(await Bun.file("build/maps/WASH.MR").arrayBuffer())))
  .root;
const categoryFor = (id) =>
  id.startsWith("tm3")
    ? ["tm3Eye", "tm3Radar", "tm3Spaceship"].includes(id)
      ? "tm3:" + id.slice(3).toLowerCase()
      : id.slice(3).toLowerCase()
    : id.toLowerCase();
const worldWeights = root.folders.get("world").folders.get("ai").folders.get("weaponWeights");
// Check the actual converter output against the source disc before perturbing it.
for (const [id, column] of Object.entries(columns)) {
  assert.deepEqual(
    [...worldWeights.files.get(categoryFor(id)).bytes],
    Array.from({ length: 12 }, (_, s) =>
      settings.length ? settings[0x1c + s * 20 + column] : 100,
    ),
  );
}
// Exercise non-100 multipliers and integer truncation, which original maps often do not.
for (const [id, column] of Object.entries(columns))
  worldWeights.files
    .get(categoryFor(id))
    .bytes.set(Array.from({ length: 12 }, (_, s) => 37 + ((s + column) % 71)));
// Reverse physical positions: resource identity, not inventory position, owns weights.
const arsenal = root.folders.get("world").folders.get("arsenal");
for (const entry of arsenal.folders.values()) {
  const bytes = entry.files.get("order").bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  view.setInt32(0, arsenal.folders.size - 1 - view.getInt32(0, true), true);
}
let slots = weaponSlots(root);
let ids = Object.keys(slots);
let expected = parameters.map((p) =>
  ids.map((id) =>
    Array.from({ length: 12 }, (_, s) => {
      const col = columns[id];
      return col === undefined
        ? 0
        : Math.floor((p.ai_sectors[s].weapon_weights[col] * (37 + ((s + col) % 71))) / 100);
    }),
  ),
);
if (values["stock-map"]) {
  const disc = await openDataDisc(values.disc);
  const game = (await readMr(await disc("/DATA/GAME.MR"))).root;
  const map = (await readMr(await disc("/DATA/YARD.MR"))).root;
  const stockColumns = [
    "Special",
    "Fire",
    "Power",
    "Homing",
    "Napalm",
    "Mortar",
    "Speed",
    "Rain",
    "Remote",
    "Ricochet",
    "MIRV",
    "Lightning",
    "Proximity",
    "Freeze",
    "Autolob",
    "FreezeRemote",
    "Massive",
    "Rain2",
    "Level3",
    "Level4",
  ];
  slots = Object.fromEntries(
    [
      ...game.folders
        .get("objects")
        .folders.get("car")
        .folders.get("weapon")
        .folders.get("list")
        .folders.keys(),
    ].map((id, i) => [id, i]),
  );
  ids = Object.keys(slots).filter(
    (id) => id === "Massive" || columns[id] !== undefined || columns["tm3" + id] !== undefined,
  );
  const sectors = [
    ...map.folders.get("world").folders.get("ai").folders.get("sectors").folders.values(),
  ].sort((a, b) => a.files.get("order").bytes[0] - b.files.get("order").bytes[0]);
  expected = parameters.map((p) =>
    ids.map((id) =>
      Array.from({ length: 12 }, (_, sector) => {
        const col = columns[id] ?? columns["tm3" + id];
        return col === undefined
          ? 0
          : Math.floor(
              (p.ai_sectors[sector].weapon_weights[col] *
                sectors[sector].files.get("weapProbArray").bytes[stockColumns.indexOf(id)]) /
                100,
            );
      }),
    ),
  );
}
assert.notDeepEqual(expected[0], expected[1], "fixture must distinguish individual cars");
const { site, archive } = prepareMapFixture(
  root,
  undefined,
  "external/rusty-metal-4/build/diagnostic/site",
);
const fixture = await openTm3Car({
  disc: values.disc,
  site,
  mods,
  output,
  world: values["stock-map"]
    ? undefined
    : {
        stem: "tm3map",
        archive,
        imageArchive: new Uint8Array(await Bun.file("build/maps/WASH.IMG").arrayBuffer()),
      },
  cars: [
    { stem: "mtm3sw", title: "TM3 Sweet Tooth", directory: "tm3sweet", file: "SWEET.MR" },
    { stem: "mtm3ag", title: "TM3 Auger", directory: "tm3auger", file: "AUGER.MR" },
  ],
  botSlots: 2,
});
try {
  const results = await fixture.page.evaluate(
    async ({ indices }) => {
      const check = (ok, why) => {
        if (!ok) throw Error(why);
      };
      const probe = Module.ccall(
        "WebDynamicModuleExport",
        "number",
        ["string", "string"],
        ["mtm3fx.sym", "Tm3TestWeaponAi"],
      );
      check(probe, "Missing AI probe");
      const weights = () => {
        Module._WebCheckpointArenaSelect(1);
        try {
          return [0, 1].map((p) =>
            indices.map((i) =>
              Array.from({ length: 12 }, (_, s) => getWasmTableEntry(probe)(p, i, s)),
            ),
          );
        } finally {
          Module._WebCheckpointArenaSelect(0);
        }
      };
      let tick = 0;
      const step = () => {
        for (let p = 0; p < 2; p++)
          check(Module._WebNetSetInput(tick, p, 0, 0, 0), "Input rejected");
        check(Module._WebNetQueueTick(tick++), JSON.stringify(tm4Port.netMatch));
        check(!tm4Port.netMatch.unsupported, tm4Port.netMatch.unsupported);
      };
      const initial = weights();
      while (tick < 90) step();
      check(Module._WebNetCaptureLocalCheckpoint(), tm4Port.localCheckpointError);
      check(Module._WebNetCapturePortableCheckpoint(), tm4Port.portableCheckpointError);
      const snapshot = tm4Port.portableCheckpoint.slice();
      const run = () => {
        tick = 90;
        const states = [];
        while (tick < 150) {
          step();
          check(Module._WebNetCaptureState(), "Capture failed");
          states.push(Array.from(tm4Port.netCapturedState));
        }
        return { weights: weights(), states };
      };
      const forward = run();
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
      return { initial, forward, rollback, portable: run() };
    },
    { indices: ids.map((id) => slots[id]) },
  );
  assert.deepEqual(results.initial, expected, "individual CAR weights × named map factors");
  assert.deepEqual(results.forward.weights, expected);
  assert.deepEqual(results.rollback, results.forward, "local rollback");
  assert.deepEqual(results.portable, results.forward, "fresh portable restore");
  console.log(
    (values["stock-map"] ? "PASS TM3 cars on TM4 map: " : "PASS TM3 map: ") +
      "human/bot weapon weights: source CAR/TER, reordered arsenal, integer multiplication, rollback and fresh restore",
  );
} finally {
  await fixture.close();
}
