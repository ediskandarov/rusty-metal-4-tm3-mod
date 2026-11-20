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
    output: { type: "string", default: "build/checks/tm3-spectre" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_spectre.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [{ stem: "mtm3sp", title: "TM3 Spectre", directory: "tm3spectre", file: "SPECTRE.MR" }],
});
const { page, log } = fixture;
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
          ["mtm3sp.sym", p],
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
      Array.from({ length: 9 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(label + " differs");
    };
    Module._WebTestPlaceWeaponTarget(4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(6);
    const rest = sample();
    await steps(1, 1);
    const launch = sample();
    if (!launch[0] || launch[3] !== 1 || !launch[4])
      throw Error("Spectre launch/ammo/target failed: " + launch);
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
    await steps(12);
    const expected = digest(),
      after = sample();
    if (!Module._WebNetRestoreLocalCheckpoint())
      throw Error("Local restore failed: " + tm4Port.localCheckpointError);
    tick = savedTick;
    await steps(12);
    if (!Module._WebNetFinishLocalReplay())
      throw Error("Local replay failed: " + tm4Port.localCheckpointError);
    equal(expected, digest(), "Missile local replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("Portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(saved, digest(), "Missile portable snapshot");
    await steps(12);
    equal(expected, digest(), "Missile portable replay");
    await steps(75);
    const expired = sample();
    if (expired[0] || expired[3] !== 1) throw Error("Missile/linger did not expire: " + expired);
    const health = Module._WebTestPlaceWeaponTarget(600);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(1, 1);
    let hit = null;
    for (let i = 0; i < 40; ++i) {
      await steps(1);
      const s = sample();
      if (s[2] > 0) {
        hit = s;
        break;
      }
    }
    const contactHealth = Module._WebTestWeaponTargetHealth();
    if (!hit || contactHealth >= health || hit[3] !== 0)
      throw Error(
        "Direct impact or ammo failed: " +
          JSON.stringify({ hit, health, contactHealth, sample: sample() }),
      );
    await globalThis.capturePhase("impact");
    if (!Module._WebNetCaptureLocalCheckpoint()) throw Error("Linger capture failed");
    const lingerTick = tick;
    await steps(35);
    const finished = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Linger restore failed");
    tick = lingerTick;
    await steps(35);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Linger replay failed");
    equal(finished, digest(), "Linger replay");
    if (sample()[0]) throw Error("Linger object survived");
    await steps(120);
    if (!Module._WebNetCapturePortableCheckpoint()) throw Error("Final sound capture failed");
    const final = new TextDecoder().decode(tm4Port.portableCheckpoint);
    const sounds = ["tm3spectre", "tm3_s15", "tm3_s00"].filter((name) => final.includes(name));
    if (sounds.length) throw Error("Attack sounds outlived the projectile: " + sounds);
    return {
      rest,
      launch,
      flying,
      after,
      expired,
      hit,
      health,
      contactHealth,
      portableBytes: portable.length,
      tick,
      unsupported: tm4Port.netMatch.unsupported,
    };
  });
  if (log.some((s) => s.startsWith("PAGEERROR") || s.includes("Aborted(")))
    throw Error("Browser runtime failed");
  console.log("SPECTRE", JSON.stringify(result));
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
} finally {
  await fixture.close();
}
