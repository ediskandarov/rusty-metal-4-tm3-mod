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
    output: { type: "string", default: "build/checks/tm3-thumper" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_thumper.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [
    {
      stem: "mtm3th",
      title: "TM3 Thumper",
      directory: "tm3thumper",
      file: "THUMPER.MR",
    },
  ],
});
const { page } = fixture;
try {
  const result = await page.evaluate(async () => {
    function call(name, ...args) {
      const lib = globalThis.LDSO.loadedLibsByName["/modules/mtm3th.wasm"];
      if (!lib) throw Error("Thumper module was not loaded");
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
      Array.from({ length: 4 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(label + " differs");
    };
    await steps(60, 64);
    const health = Module._WebTestPlaceWeaponTarget(1000);
    call("test_select", Module._WebTestReplayCarAddress());
    const before = sample();
    await steps(1, 65);
    const launch = sample();
    if (launch[0] !== before[0] - 1 || launch[1] !== 0)
      throw Error("Failed to launch stream " + launch);
    for (let i = 1; i <= 7; ++i) {
      await steps(1);
      const state = sample();
      if (state[1] !== i || state[2] !== i || state[3] !== i % 3)
        throw Error("Emission " + i + ": " + state);
    }
    const first = sample();
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(
        "Mid-stream capture failed " +
          tm4Port.localCheckpointError +
          " " +
          tm4Port.portableCheckpointError,
      );
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick;
    async function drive() {
      const trace = [];
      for (let i = 8; i <= 48; ++i) {
        await steps(1);
        const state = sample();
        if (state[1] !== (i <= 15 ? i : -1) || (i <= 15 && state[3] !== i % 3))
          throw Error("Stream timing " + i + ": " + state);
        trace.push([...state, Module._WebTestWeaponTargetHealth()]);
      }
      return trace;
    }
    const hits = await drive(),
      last = hits.at(-1);
    if (last[2] || last[4] >= health || !hits.some((s) => s[2] === 15))
      throw Error(
        "Segments or hit " +
          JSON.stringify({
            health,
            last,
            peak: Math.max(...hits.map((s) => s[2])),
          }),
      );
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    equal(hits.flat(), (await drive()).flat(), "Local stream");
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
    equal(hits.flat(), (await drive()).flat(), "Portable stream");
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
