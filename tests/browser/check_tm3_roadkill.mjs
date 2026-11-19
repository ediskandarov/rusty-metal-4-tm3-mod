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
    output: { type: "string", default: "build/checks/tm3-roadkill" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_roadkill.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [{ stem: "mtm3rk", title: "TM3 Roadkill", directory: "tm3roadkill", file: "RDKILL.MR" }],
});
const { page } = fixture;
try {
  const result = await page.evaluate(async () => {
    function call(name, ...args) {
      const lib = globalThis.LDSO.loadedLibsByName["/modules/mtm3rk.wasm"];
      if (!lib) throw Error("Roadkill module was not loaded");
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
      Array.from({ length: 12 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(label + " differs");
    };
    const health = Module._WebTestPlaceWeaponTarget(4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(6);
    await steps(1, 1);
    const launch = sample();
    if (!launch[0] || launch[3] !== 1 || !launch[4])
      throw Error("Roadkill launch/ammo/target failed: " + launch);
    if (launch[10] !== 17 || launch[11] !== 700) throw Error("Wrong Roadkill profile");
    await steps(8);
    const flying = sample();
    if (!flying[0] || flying[1] < 6 || flying[2])
      throw Error("Missile did not remain in flight: " + flying);
    await globalThis.capturePhase("flying");
    if (!Module._WebNetCaptureLocalCheckpoint())
      throw Error("Local checkpoint failed: " + tm4Port.localCheckpointError);
    if (!Module._WebNetCapturePortableCheckpoint())
      throw Error("Portable checkpoint failed: " + tm4Port.portableCheckpointError);
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick,
      saved = digest();
    let impactTicks = 0;
    while (impactTicks < 64 && !sample()[2]) {
      await steps(1);
      ++impactTicks;
    }
    const impact = sample();
    if (impact[2] !== 30) throw Error("Roadkill failed to enter impact state: " + impact);
    if (!Module._WebNetCapturePortableCheckpoint()) throw Error("Burst checkpoint failed");
    if (!new TextDecoder().decode(tm4Port.portableCheckpoint).includes("tm3Explosion"))
      throw Error("Missing Roadkill area burst");
    const expected = digest();
    await globalThis.capturePhase("impact");
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Flight restore failed");
    tick = savedTick;
    await steps(impactTicks);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Flight replay failed");
    equal(expected, digest(), "Roadkill impact after local rollback");
    async function restoreFlight() {
      if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
        throw Error("Restart failed");
      Module._WebNetEndReplay();
      tm4Port.portableCheckpoint = portable;
      if (!Module._WebNetBeginPortableReplay()) throw Error("Portable flight restore failed");
      Module._WebNetEndReplay();
      tick = savedTick;
    }
    await restoreFlight();
    equal(saved, digest(), "Restored flight");
    await steps(impactTicks);
    equal(expected, digest(), "Roadkill impact after portable restore");
    await steps(31);
    if (sample()[0]) throw Error("Projectile survived its linger interval");
    const targetHealth = Module._WebTestWeaponTargetHealth();
    if (!impact[9] || targetHealth >= health)
      throw Error("World impact failed to damage nearby target");
    await restoreFlight();
    const directStart = Module._WebTestPlaceWeaponTarget(2000);
    call("test_shift_y", sample()[4], -1400);
    let direct = sample();
    for (let i = 0; i < 60 && !direct[2]; ++i) {
      await steps(1);
      direct = sample();
    }
    const directEnd = Module._WebTestWeaponTargetHealth();
    if (direct[9] || directStart - directEnd !== 700)
      throw Error("Direct contact: " + JSON.stringify({ direct, directStart, directEnd }));
    return {
      launch,
      flying,
      impactTicks,
      impact,
      health,
      targetHealth,
      direct,
      directStart,
      directEnd,
    };
  });
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
} finally {
  await fixture.close();
}
