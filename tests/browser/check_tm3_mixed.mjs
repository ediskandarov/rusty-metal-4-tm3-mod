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
    output: { type: "string", default: "build/checks/tm3-mixed" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_mixed.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [
    { stem: "mtm3sp", title: "TM3 Spectre", directory: "tm3spectre", file: "SPECTRE.MR" },
    { stem: "mtm3wh", title: "TM3 Warthog", directory: "tm3warthog", file: "WARTHOG.MR" },
  ],
});
const { page, log } = fixture;
try {
  const result = await page.evaluate(async () => {
    function call(module, name, ...args) {
      const lib = globalThis.LDSO.loadedLibsByName[`/modules/${module}.wasm`];
      if (!lib) throw Error("Missing " + module);
      const saved = stackSave();
      const raw = new TextEncoder().encode(name + "\0"),
        p = stackAlloc(raw.length);
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
        for (let slot = 0; slot < 2; ++slot)
          if (!Module._WebNetSetInput(tick, slot, buttons, 0, 0)) throw Error("Input failed");
        if (!Module._WebNetQueueTick(tick++)) throw Error("Tick failed");
        await new Promise((r) => setTimeout(r, 15));
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
      }
    }
    const car = (slot) => call("mtm3wh", "test_car", slot);
    const sample = () => ({
      spectre: Array.from({ length: 9 }, (_, field) => call("mtm3sp", "test_read", car(0), field)),
      warthog: Array.from({ length: 3 }, (_, slot) =>
        Array.from({ length: 10 }, (_, field) => call("mtm3wh", "test_read", car(1), slot, field)),
      ),
    });
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Capture failed");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, name) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(name + " differs");
    };
    if (!Module._WebTestPreparePlayerDuel(0, 1, 3500)) throw Error("Cannot arrange mixed duel");
    call("mtm3sp", "test_select", car(0));
    call("mtm3wh", "test_select", car(1));
    await steps(6);
    await steps(1, 1);
    await steps(5);
    const flying = sample();
    if (
      !flying.spectre[0] ||
      flying.spectre[3] !== 1 ||
      flying.warthog.some((m) => !m[0] || m[3] !== 1)
    )
      throw Error("Mixed launch failed: " + JSON.stringify(flying));
    equal(
      flying.warthog.map((m) => m[8]),
      [0x161616, 0x1f, 0x1f0000],
      "Per-projectile colors",
    );
    await globalThis.capturePhase("mixed-volley");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error("Mixed capture failed: " + tm4Port.portableCheckpointError);
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick,
      saved = digest();
    // Callback contexts are serialized by their car model, without storing
    // the descriptor's debug name in the binary snapshot.
    if (
      !call("mtm3sp", "__rm4_car_snapshot_type", car(0)) ||
      !call("mtm3wh", "__rm4_car_snapshot_type", car(1)) ||
      call("mtm3sp", "__rm4_car_snapshot_type", car(1)) ||
      call("mtm3wh", "__rm4_car_snapshot_type", car(0))
    )
      throw Error("Mixed callback descriptions do not match their owning cars");
    await steps(8);
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Mixed restore failed");
    tick = savedTick;
    await steps(8);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Mixed replay failed");
    equal(expected, digest(), "Mixed local replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Fresh mixed match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("Mixed portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(saved, digest(), "Mixed portable snapshot");
    await steps(8);
    equal(expected, digest(), "Mixed portable replay");
    await steps(110);
    const finished = sample();
    if (finished.spectre[0] || finished.warthog.some((m) => m[0]))
      throw Error("Mixed projectiles did not finish");
    return {
      flying,
      finished,
      portableBytes: portable.length,
      tick,
      unsupported: tm4Port.netMatch.unsupported,
    };
  });
  if (log.some((s) => s.startsWith("PAGEERROR") || s.includes("Aborted(")))
    throw Error("Browser runtime failed");
  console.log("MIXED", JSON.stringify(result));
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
} finally {
  await fixture.close();
}
