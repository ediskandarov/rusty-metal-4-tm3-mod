/* global Module, tm4Port, stackSave, stackAlloc, stackRestore, HEAPU8, getWasmTableEntry */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { prepareFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({ options: { disc: { type: "string" } } });
if (!values.disc) throw Error("Supply --disc TM4_DISC_DIRECTORY");
const output = resolve("build/checks/turbo");
const mods = resolve(output, "fixture");
await prepareFixture(mods, "build/TM3.MR", "build/checks/cars");
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve("external/rusty-metal-4/build/diagnostic/site"),
  mods,
  output,
  cars: [
    { stem: "mtm3fs", title: "TM3 Firestarter", directory: "tm3firestarter", file: "FIRE.MR" },
  ],
});
try {
  const result = await fixture.page.evaluate(async () => {
    const check = (condition, label) => {
      if (!condition) throw Error(label);
    };
    function call(module, name, ...args) {
      const saved = stackSave();
      try {
        const bytes = new TextEncoder().encode(name + "\0");
        const ptr = stackAlloc(bytes.length);
        HEAPU8.set(bytes, ptr);
        const fn = Module.ccall(
          "WebDynamicModuleExport",
          "number",
          ["string", "number"],
          [module + ".sym", ptr],
        );
        check(fn, "Missing " + name);
        return getWasmTableEntry(fn)(...args);
      } finally {
        stackRestore(saved);
      }
    }
    const car = () => Module._WebTestReplayCarAddress();
    const query = (field) => call("mtm3fx", "Tm3TestTurbo", car(), field);
    const fuel = (value) => call("mtm3fs", "test_set_fuel", car(), value);
    let tick = 0;
    async function step(buttons = 0) {
      check(
        Module._WebNetSetInput(tick, 0, buttons, 0, 0) &&
          Module._WebNetSetInput(tick, 1, 0, 0, 0) &&
          Module._WebNetQueueTick(tick),
        "Queue " + tick,
      );
      ++tick;
      await new Promise((r) => setTimeout(r, 20));
      check(!tm4Port.netMatch.unsupported, tm4Port.netMatch.unsupported);
    }
    async function steps(n, buttons = 0) {
      for (let i = 0; i < n; ++i) await step(buttons);
    }
    const digest = () => {
      check(Module._WebNetCaptureState(), "Capture");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, name) => check(JSON.stringify(a) === JSON.stringify(b), name);
    await steps(30);
    check(query(0) === 1 && query(1) === 0 && query(2) === 0, "Idle attachment");
    for (const amount of [0, 19, 20]) {
      fuel(amount);
      await step(0x40);
      await step();
      const sprites = query(3);
      await step(0x40);
      check(query(5) === Number(amount === 20), "Actual boost " + amount);
      check(query(1) === Number(amount === 20), "Loop follows boost " + amount);
      check(query(2) === 0, "Original presentation leaked");
      if (amount === 20) check(query(3) === sprites + 1, "Last fuel tick did not emit once");
      await steps(18);
      check(query(1) === 0 && query(6) === 0, "Loop did not finish");
    }
    fuel(4096);
    await step(0x40);
    await step();
    await step(0x40);
    check(query(1) === 1 && query(6) === 1 && !query(2), "One custom loop");
    check(
      Module._WebNetCaptureLocalCheckpoint() && Module._WebNetCapturePortableCheckpoint(),
      "Capture turbo: " + tm4Port.localCheckpointError + " / " + tm4Port.portableCheckpointError,
    );
    const portable = tm4Port.portableCheckpoint.slice();
    const savedTick = tick;
    async function drive() {
      const trace = [];
      for (let i = 0; i < 20; ++i) {
        await step(i < 10 ? 0x40 : 0);
        trace.push([query(1), query(2), query(3), query(5), query(6)]);
      }
      return trace;
    }
    const expected = await drive();
    const state = digest();
    check(Module._WebNetRestoreLocalCheckpoint(), "Local restore");
    tick = savedTick;
    equal(expected, await drive(), "Local turbo trace");
    check(Module._WebNetFinishLocalReplay(), "Local finish");
    equal(state, digest(), "Local state");
    check(
      await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true }),
      "Restart",
    );
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    check(
      Module._WebNetBeginPortableReplay(),
      "Portable turbo restore: " + tm4Port.portableCheckpointError,
    );
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(expected, await drive(), "Portable turbo trace");
    equal(state, digest(), "Portable state");
    fuel(4096);
    await steps(18);
    await step(0x40);
    await step();
    await step(0x40);
    const before = query(4);
    check(query(1) === 1, "Active loop before removal");
    check(Module._WebNetCaptureLocalCheckpoint(), "Capture before death");
    const deathStart = tick;
    async function kill() {
      check(Module._WebTestKillParticipant(0), "Kill turbo owner");
      await step();
      check(query(4) === before - 1, "Orphan turbo after death");
    }
    await kill();
    check(Module._WebNetCapturePortableCheckpoint(), "Capture without owner");
    const dead = tm4Port.portableCheckpoint.slice();
    await steps(100);
    check(query(0) === 1 && query(4) === before, "Respawn did not attach one turbo");
    const respawned = digest();
    check(Module._WebNetRestoreLocalCheckpoint(), "Restore before death");
    tick = deathStart;
    await kill();
    await steps(100);
    check(Module._WebNetFinishLocalReplay(), "Finish death replay");
    equal(respawned, digest(), "Rollback through turbo removal and respawn");
    check(
      await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true }),
      "Restart for dead snapshot",
    );
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = dead;
    check(
      Module._WebNetBeginPortableReplay(),
      "Restore dead snapshot: " + tm4Port.portableCheckpointError,
    );
    Module._WebNetEndReplay();
    tick = deathStart + 1;
    await steps(100);
    equal(respawned, digest(), "Portable snapshot without original turbo owner");
    return {
      boundaryFuel: [0, 19, 20],
      localRollback: true,
      portableRestore: true,
      ownerRemoval: true,
      respawn: true,
    };
  });
  assert.equal(result.ownerRemoval, true);
  console.log("PASS turbo", result);
} finally {
  await fixture.close();
}
