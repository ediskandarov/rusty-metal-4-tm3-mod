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
    output: { type: "string", default: "build/checks/tm3-flower" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_flower.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [{ stem: "mtm3fp", title: "TM3 Flower Power", directory: "tm3flower", file: "FPOWER.MR" }],
});
const { page, log } = fixture;
try {
  const result = await page.evaluate(async () => {
    function call(name, ...args) {
      const lib = globalThis.LDSO.loadedLibsByName["/modules/mtm3fp.wasm"];
      if (!lib) throw Error("Flower Power module was not loaded");
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
    const rest = sample();
    await steps(1, 1);
    const launch = sample();
    if (!launch[0] || launch[3] !== 1 || !launch[4])
      throw Error("Flower Power launch/ammo/target failed: " + launch);
    if (launch[10] !== 21 || launch[11] !== 340) throw Error("Wrong Flower profile");
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
    await steps(40);
    const expected = digest(),
      after = sample();
    if (!Module._WebNetRestoreLocalCheckpoint())
      throw Error("Local restore failed: " + tm4Port.localCheckpointError);
    tick = savedTick;
    await steps(40);
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
    await steps(40);
    equal(expected, digest(), "Missile portable replay");
    const hit = sample(),
      contactHealth = Module._WebTestWeaponTargetHealth();
    if (hit[0] || health - contactHealth !== 340)
      throw Error(
        "Direct impact/immediate removal failed: " + JSON.stringify({ hit, health, contactHealth }),
      );
    await globalThis.capturePhase("impact");
    if (new TextDecoder().decode(new Uint8Array(digest())).includes("tm3Explosion"))
      throw Error("Flower incorrectly used a custom area burst");
    // Restore across the immediate removal, including its owner's weak slot.
    if (!Module._WebNetCaptureLocalCheckpoint()) throw Error("Impact capture failed");
    const impactTick = tick;
    await steps(15);
    const finished = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Impact restore failed");
    tick = impactTick;
    await steps(15);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Impact replay failed");
    equal(finished, digest(), "Impact replay");
    if (sample()[0]) throw Error("Destroyed projectile survived");
    if (!Module._WebTestAimAtWeakDestroyable()) throw Error("Cannot prepare world hit");
    // The fixture aims the car muzzle at a wall. Flower starts 512 units above
    // that attachment, so lower the car before firing to keep the shot on it.
    call("test_shift_y", Module._WebTestReplayCarAddress(), 512);
    Module._WebTestPlaceWeaponTarget(4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(1, 1);
    let world = null;
    for (let i = 0; i < 35; ++i) {
      await steps(1);
      const current = sample();
      if (current[0] && current[9]) {
        world = current;
        break;
      }
    }
    if (!world) throw Error("No pending world hit");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error("World capture failed");
    const worldTick = tick,
      worldPortable = tm4Port.portableCheckpoint.slice(),
      worldSaved = digest();
    await steps(12);
    const worldExpected = digest();
    if (!tm4Port.destroyableHits || tm4Port.lastDestroyableHit?.survived || sample()[0])
      throw Error(
        "World impact did not destroy both target and projectile: " +
          JSON.stringify({
            world,
            sample: sample(),
            hits: tm4Port.destroyableHits,
            last: tm4Port.lastDestroyableHit,
            target: tm4Port.testDestroyableName,
          }),
      );
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("World local restore failed");
    tick = worldTick;
    await steps(12);
    if (!Module._WebNetFinishLocalReplay()) throw Error("World replay failed");
    equal(worldExpected, digest(), "World replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("World fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = worldPortable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("World portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = worldTick;
    equal(worldSaved, digest(), "World portable snapshot");
    await steps(12);
    equal(worldExpected, digest(), "World portable replay");
    await steps(120);
    if (!Module._WebNetCapturePortableCheckpoint()) throw Error("Final sound capture failed");
    const final = new TextDecoder().decode(tm4Port.portableCheckpoint);
    const sounds = ["tm3flower", "tm3_s00"].filter((name) => final.includes(name));
    if (sounds.length) throw Error("Attack sounds outlived the projectile: " + sounds);
    return {
      rest,
      launch,
      flying,
      after,
      hit,
      world,
      health,
      contactHealth,
      portableBytes: portable.length,
      tick,
      unsupported: tm4Port.netMatch.unsupported,
    };
  });
  if (log.some((s) => s.startsWith("PAGEERROR") || s.includes("Aborted(")))
    throw Error("Browser runtime failed");
  console.log("FLOWER", JSON.stringify(result));
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
} finally {
  await fixture.close();
}
