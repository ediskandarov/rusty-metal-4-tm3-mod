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
    output: { type: "string", default: "build/checks/tm3-outlaw" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_outlaw.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  playerCount: 3,
  cars: [
    {
      stem: "mtm3ol",
      title: "TM3 Outlaw",
      directory: "tm3outlaw",
      file: "OUTLAW.MR",
    },
  ],
});
const { page } = fixture;
try {
  const result = await page.evaluate(async () => {
    function call(name, ...args) {
      const saved = stackSave();
      const raw = new TextEncoder().encode(name + "\0");
      const p = stackAlloc(raw.length);
      HEAPU8.set(raw, p);
      try {
        const i = Module.ccall(
          "WebDynamicModuleExport",
          "number",
          ["string", "number"],
          ["mtm3ol.sym", p],
        );
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
          !Module._WebNetSetInput(tick, 2, 0, 0, 0) ||
          !Module._WebNetQueueTick(tick)
        )
          throw Error("Cannot queue " + tick);
        ++tick;
        await new Promise((r) => setTimeout(r, 15));
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
      }
    }
    const sample = () =>
      Array.from({ length: 8 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i]))
        throw Error(label + " differs at value " + a.findIndex((v, i) => v !== b[i]));
    };
    await steps(60, 64);
    const place = (slot, distance, lateral = 0) =>
      call("test_place", Module._WebTestReplayCarAddress(), slot, distance, lateral);
    place(1, 900, -350);
    place(2, 900, 350);
    const health = sample()[2];
    call("test_select", Module._WebTestReplayCarAddress());
    const before = sample();
    await steps(1, 65);
    const launch = sample();
    if (launch[0] !== before[0] - 1 || launch[3] !== 0 || launch[4] !== 1 || launch[5] !== 0)
      throw Error("Failed to launch lightning " + launch);
    await steps(12);
    const first = sample();
    if (!health || first[2] >= health || first[7] >= launch[7] || first[5] !== 2)
      throw Error(
        "Outlaw failed to lift and damage its target " + JSON.stringify({ launch, first }),
      );
    await globalThis.capturePhase("arcs");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(
        "Mid-lightning capture failed " +
          tm4Port.localCheckpointError +
          " " +
          tm4Port.portableCheckpointError,
      );
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick;
    async function drive() {
      const trace = [];
      for (let age = 13; age <= 94; ++age) {
        if (age === 20) place(1, 5500);
        if (age === 22) place(2, 5500, 500);
        if (age === 25) place(1, 800);
        await steps(1);
        const state = sample();
        if (state[3] !== (age <= 90 ? age : -1))
          throw Error("Emitter lifetime " + age + ": " + state);
        if (
          (age === 20 && (state[5] !== 1 || state[4] !== 1)) ||
          (age === 22 && (state[5] !== 0 || state[4] !== 1)) ||
          (age === 25 && state[5] !== 1)
        )
          throw Error("Target change " + age + ": " + state);
        trace.push(state);
      }
      return trace;
    }
    const hits = await drive();
    if (hits.slice(0, 75).some((s, i, states) => i >= 3 && s[1] === states[i - 3][1]))
      throw Error("Siren did not alternate every three ticks");
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    equal(hits.flat(), (await drive()).flat(), "Local lightning");
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
    equal(hits.flat(), (await drive()).flat(), "Portable lightning");
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
