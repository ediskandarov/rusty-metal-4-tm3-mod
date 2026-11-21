/* global Module, tm4Port, getWasmTableEntry */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { readMr } from "@tm4/resources/compatibility/mr";

import { prepareFixture, prepareMapFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    output: { type: "string", default: "build/checks/surface-effects" },
  },
});
if (!values.disc) throw Error("Supply --disc TM4_DISC_DIRECTORY");
const mods = resolve(values.output, "fixture");
await prepareFixture(mods, "build/TM3.MR", "build/checks/cars");
const root = (await readMr(new Uint8Array(await Bun.file("build/maps/WASH.MR").arrayBuffer())))
  .root;
const { site, archive } = prepareMapFixture(
  root,
  undefined,
  "external/rusty-metal-4/build/diagnostic/site",
);
const fixture = await openTm3Car({
  disc: values.disc,
  site,
  mods,
  output: values.output,
  world: {
    stem: "tm3map",
    archive,
    imageArchive: new Uint8Array(await Bun.file("build/maps/WASH.IMG").arrayBuffer()),
  },
  cars: [{ stem: "mtm3sw", title: "TM3 Sweet Tooth", directory: "tm3sweet", file: "SWEET.MR" }],
});
try {
  const result = await fixture.page.evaluate(async () => {
    const check = (ok, why) => {
      if (!ok) throw Error(why);
    };
    const rawProbe = (action, material = 1, offset = 0) => {
      const slot = Module.ccall(
        "WebDynamicModuleExport",
        "number",
        ["string", "string"],
        ["mtm3fx.sym", "Tm3TestSurface"],
      );
      check(slot, "Missing surface probe");
      Module._WebCheckpointArenaSelect(1);
      try {
        return getWasmTableEntry(slot)(action, material, offset);
      } finally {
        Module._WebCheckpointArenaSelect(0);
      }
    };
    const probe = (action, material = 1, offset = 0) => {
      const before = rawProbe(7);
      const result = rawProbe(action, material, offset);
      // Destroying the whole car also runs gameplay teardown, outside this adapter.
      if (action !== 6)
        check(rawProbe(7) === before, `Surface action ${action} consumed gameplay randomness`);
      return result;
    };
    const count = (name) => {
      Module.ccall("WebTestSnapshotObjects", null, ["string"], [name]);
      return tm4Port.testSnapshotObjects.length;
    };
    let tick = 0;
    const step = () => {
      for (let slot = 0; slot < 2; ++slot)
        check(Module._WebNetSetInput(tick, slot, 0, 0, 0), "Input rejected");
      check(Module._WebNetQueueTick(tick++), "Tick rejected");
      check(!tm4Port.netMatch.unsupported, tm4Port.netMatch.unsupported);
    };
    while (tick < 120) step();
    const gameplaySeed = rawProbe(7);
    check(rawProbe(8, 0) === 1, "Stock sound emitter failed");
    check(rawProbe(7) !== gameplaySeed, "Stock sound RNG behavior changed");
    check(probe(8, 1) === 1, "Cosmetic sound emitter failed or retained constructor flags");
    check(count("tm3WheelSurface") === 2, "Each car must own one surface instance");
    check(probe(4) > 0, "Physics did not deliver grounded wheel contacts");
    check(probe(0) === 1 && probe(3) === 15, "No tire marks");
    check(probe(5) & 2, "No dust");
    check(Module._WebNetCaptureLocalCheckpoint(), tm4Port.localCheckpointError);
    check(Module._WebNetCapturePortableCheckpoint(), tm4Port.portableCheckpointError);
    const snapshot = tm4Port.portableCheckpoint.slice();
    const run = () => {
      tick = 120;
      check(probe(3) === 15, "Restored active marks lost");
      const before = count("tm3TireMark");
      probe(0, 3, 32);
      check(count("tm3TireMark") === before + 4, "Material change joined incompatible marks");
      probe(1);
      check(probe(3) === 0 && probe(4) === 0, "Airborne marks did not end");
      probe(0, 1, 64);
      check(probe(3) === 15, "Landing did not start new marks");
      Module._WebCheckpointArenaSelect(1);
      try {
        check(Module._WebTestTeleportCamera(0, 0) >= 0, "Teleport failed");
      } finally {
        Module._WebCheckpointArenaSelect(0);
      }
      probe(2); // The same physics frame must not revive contacts after relocation.
      check(probe(3) === 0 && probe(4) === 0, "Relocation retained contact history");
      probe(0, 1, 2048);
      check(probe(3) === 15, "Relocation stretched a tire mark");
      probe(0, 2);
      check(probe(3) === 0, "Water retained road marks");
      check((probe(5) & 7) === 7, "Missing splash, dust or spray");
      const states = [];
      while (tick < 135) {
        step();
        check(Module._WebNetCaptureState(), "State capture failed");
        states.push(Array.from(tm4Port.netCapturedState));
      }
      probe(6);
      check(count("tm3WheelSurface") === 1, "Removed car retained its surface instance");
      check(count("tm3TireMark") === 0, "Removed car retained owned marks");
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
    return { expected, rollback, portable };
  });
  assert.deepEqual(result.rollback, result.expected, "surface rollback");
  assert.deepEqual(result.portable, result.expected, "surface portable restore");
  assert.ok(!fixture.log.some((line) => /PAGEERROR|Aborted|RuntimeError/.test(line)));
  console.log("PASS surface marks, splash, dust, spray, relocation, removal and snapshot replay");
} finally {
  await fixture.close();
}
