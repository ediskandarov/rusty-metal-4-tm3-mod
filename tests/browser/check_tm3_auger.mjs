/* global Module, tm4Port, stackSave, stackAlloc, stackRestore, HEAPU8, getWasmTableEntry */
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { prepareFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";
const { values } = parseArgs({
  strict: true,
  options: {
    disc: { type: "string" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    mods: { type: "string", default: "build/checks/fixture" },
    output: { type: "string", default: "build/checks/tm3-auger" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_auger.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [
    {
      stem: "mtm3ag",
      title: "TM3 Auger",
      directory: "tm3auger",
      file: "AUGER.MR",
    },
  ],
});
const { page } = fixture;
try {
  const result = await page.evaluate(async () => {
    function call(name, ...args) {
      const lib = globalThis.LDSO.loadedLibsByName["/modules/mtm3ag.wasm"];
      if (!lib) throw Error("Auger module was not loaded");
      const saved = stackSave();
      const raw = new TextEncoder().encode(name + "\0");
      const p = stackAlloc(raw.length);
      HEAPU8.set(raw, p);
      try {
        const i = lib.exports.Tm4ModuleExport(p);
        if (!i) throw Error("Missing " + name);
        return getWasmTableEntry(i)(...args);
      } finally {
        stackRestore(saved);
      }
    }
    let tick = 0;
    async function steps(n, buttons = 0) {
      for (let i = 0; i < n; ++i) {
        if (
          !Module._WebNetSetInput(tick, 0, buttons, 0, 0) ||
          !Module._WebNetSetInput(tick, 1, 0, 0, 0) ||
          !Module._WebNetQueueTick(tick)
        )
          throw Error("Cannot queue " + tick);
        ++tick;
        await new Promise((r) => setTimeout(r, 15));
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
      }
    }
    const sample = () =>
      Array.from({ length: 6 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(label + " differs");
    };
    await steps(60, 64);
    const health = Module._WebTestPlaceWeaponTarget(480);
    call("test_select", Module._WebTestReplayCarAddress());
    const before = sample();
    await steps(1, 65);
    const launch = sample();
    if (launch[0] !== 60 || launch[2] !== before[2] - 1)
      throw Error("Launch failed " + JSON.stringify({ before, launch }));
    let first;
    for (let i = 0; i < 32; ++i) {
      await steps(1, 64);
      first = sample();
      if (first[3] && Module._WebTestWeaponTargetHealth() <= health - 15) break;
    }
    if (!first[3] || Module._WebTestWeaponTargetHealth() > health - 15)
      throw Error(
        "No drill damage or capture " +
          JSON.stringify({
            health,
            first,
            launch,
            hp: Module._WebTestWeaponTargetHealth(),
          }),
      );
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(
        "Mid-drill capture failed " +
          tm4Port.localCheckpointError +
          " " +
          tm4Port.portableCheckpointError,
      );
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick;
    async function drive() {
      const trace = [];
      let previous = sample();
      for (let i = 0; i < first[0] + 95; ++i) {
        await steps(1);
        const state = sample();
        if (
          state[0] !== Math.max(0, previous[0] - 1) ||
          state[4] !== ((previous[4] + state[1]) & 4095)
        )
          throw Error("Drill timer or pose differs at " + i + ": " + state);
        if (!previous[0] && (state[3] || state[1] !== Math.max(0, previous[1] - 8)))
          throw Error("Drill release or spin-down differs at " + i + ": " + state);
        trace.push([...state, Module._WebTestWeaponTargetHealth()]);
        previous = state;
      }
      return trace;
    }
    const hits = await drive();
    if (hits.at(-1)[5] || !hits.some((s) => s[5] > 1536) || !hits.some((s) => s[6] <= health - 30))
      throw Error("Drill damage or loop pitch failed " + JSON.stringify(hits.slice(0, 5)));
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    equal(hits.flat(), (await drive()).flat(), "Local drill");
    if (!Module._WebNetFinishLocalReplay()) throw Error("Local replay failed");
    equal(expected, digest(), "Local digest");
    if (
      !(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], {
        async: true,
      }))
    )
      throw Error("Restart failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay()) throw Error("Portable restore failed");
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(hits.flat(), (await drive()).flat(), "Portable drill");
    equal(expected, digest(), "Portable digest");
    return {
      before,
      launch,
      health,
      first,
      last: hits.at(-1),
      comparedTicks: hits.length,
    };
  });
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
} finally {
  await fixture.close();
}
