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
    output: { type: "string", default: "build/checks/tm3-axel" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_axel.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [{ stem: "mtm3ax", title: "TM3 Axel", directory: "tm3axel", file: "AXEL.MR" }],
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
          ["mtm3ax.sym", p],
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
      Array.from({ length: 8 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(label + " differs");
    };
    await steps(8, 32768);
    const left = sample();
    await steps(12, 8192);
    const right = sample();
    if (!left[0] || left[0] !== left[1] || right[0] !== right[1] || left[0] * right[0] >= 0)
      throw Error("Axel steering pose: " + JSON.stringify({ left, right }));
    await steps(55, 64);
    const health = Module._WebTestPlaceWeaponTarget(850);
    call("test_select", Module._WebTestReplayCarAddress());
    const before = sample();
    await steps(1, 65);
    const launch = sample();
    if (launch[2] !== before[2] - 1 || launch[4] !== 1)
      throw Error("Axel launch/ammo: " + JSON.stringify({ before, launch }));
    await steps(1);
    const first = sample();
    await steps(1);
    const second = sample();
    if (
      ![5, 6, 7].every((i) => second[i] - first[i] === first[i] - launch[i]) ||
      first[4] !== 200 ||
      second[4] !== 400 ||
      ![5, 6, 7].some((i) => first[i] !== second[i])
    )
      throw Error("Moving wave: " + JSON.stringify({ launch, first, second }));
    await globalThis.capturePhase("wave");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(
        "Wave capture: " + tm4Port.localCheckpointError + " " + tm4Port.portableCheckpointError,
      );
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick,
      saved = digest();
    const hits = [];
    for (let i = 3; i <= 16; ++i) {
      await steps(1);
      const wave = sample(),
        expectedRadius = i === 16 ? -1 : 400 + (i - 2) * 50;
      if (wave[4] !== expectedRadius || wave[3] !== before[3])
        throw Error("Wave radius or owner health at " + i + ": " + wave);
      hits.push(Module._WebTestWeaponTargetHealth());
    }
    if (
      hits.at(-1) >= health ||
      hits.filter((v, i) => v !== (i ? hits[i - 1] : health)).length !== 1
    )
      throw Error("Expected one target hit: " + JSON.stringify({ health, hits }));
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local wave restore failed");
    tick = savedTick;
    await steps(14);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Local wave replay failed");
    equal(expected, digest(), "Wave local replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Restart failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay()) throw Error("Portable wave restore failed");
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(saved, digest(), "Wave portable snapshot");
    await steps(14);
    equal(expected, digest(), "Wave portable replay");
    return { left, right, launch, first, second, health, hits };
  });
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
} finally {
  await fixture.close();
}
