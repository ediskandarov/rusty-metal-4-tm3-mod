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
    output: { type: "string", default: "build/checks/tm3-clubkid" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_clubkid.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [
    {
      stem: "mtm3ck",
      title: "TM3 Club Kid",
      directory: "tm3clubkid",
      file: "CLUBKID.MR",
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
          ["mtm3ck.sym", p],
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
          !Module._WebNetQueueTick(tick)
        )
          throw Error("Cannot queue " + tick);
        ++tick;
        await new Promise((r) => setTimeout(r, 15));
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
      }
    }
    const sample = () =>
      Array.from({ length: 13 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i]))
        throw Error(label + " differs at value " + a.findIndex((v, i) => v !== b[i]));
    };
    await steps(60, 64);
    const health = Module._WebTestPlaceWeaponTarget(1000);
    call("test_select", Module._WebTestReplayCarAddress());
    const before = sample();
    await steps(1, 65);
    const launch = sample();
    if (launch[0] !== before[0] - 1 || launch[1] !== 0)
      throw Error("Failed to launch vortex " + launch);
    await steps(12);
    const first = sample();
    const dx = launch[7] - launch[10],
      dz = launch[9] - launch[12];
    const tx = first[7] - first[10],
      tz = first[9] - first[12];
    if (!health || Math.hypot(tx, tz) >= Math.hypot(dx, dz) || dx * tz - dz * tx >= 0)
      throw Error("Expected inward and tangential movement " + JSON.stringify({ launch, first }));
    let capturedVortex = false;
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(
        "Mid-vortex capture failed " +
          tm4Port.localCheckpointError +
          " " +
          tm4Port.portableCheckpointError,
      );
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick;
    async function drive() {
      const trace = [];
      for (let age = 13; age <= 198; ++age) {
        await steps(1);
        const state = sample();
        if (
          age <= 180 &&
          (state[1] !== age || state[2] !== 512 + 128 * age || state[3] !== 1200 + 40 * age)
        )
          throw Error("Vortex growth " + age + ": " + state);
        if (age > 180 && state[1] !== -1) throw Error("Vortex outlived its burst");
        if (age === 80 && !capturedVortex) {
          await globalThis.capturePhase("vortex");
          capturedVortex = true;
        }
        trace.push(state);
      }
      return trace;
    }
    const hits = await drive();
    if (!hits.some((s) => s[5]) || hits.at(-1)[5] || hits.at(-1)[6] >= health)
      throw Error("Missing terminal burst or burst did not expire");
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    equal(hits.flat(), (await drive()).flat(), "Local vortex");
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
    equal(hits.flat(), (await drive()).flat(), "Portable vortex");
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
