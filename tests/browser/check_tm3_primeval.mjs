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
    output: { type: "string", default: "build/checks/tm3-primeval" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_primeval.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [{ stem: "mtm3pv", title: "TM3 Primeval", directory: "tm3primeval", file: "PRIMEVAL.MR" }],
});
const { page, log } = fixture;
try {
  const result = await page.evaluate(async () => {
    function call(name, ...args) {
      const saved = stackSave();
      const raw = new TextEncoder().encode(name + "\0"),
        p = stackAlloc(raw.length);
      HEAPU8.set(raw, p);
      try {
        const i = Module.ccall(
          "WebDynamicModuleExport",
          "number",
          ["string", "number"],
          ["mtm3pv.sym", p],
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
        for (let slot = 0; slot < 2; ++slot)
          if (!Module._WebNetSetInput(tick, slot, slot === 0 ? buttons : 0, 0, 0))
            throw Error("Input failed");
        if (!Module._WebNetQueueTick(tick++)) throw Error("Tick failed");
        await new Promise((r) => setTimeout(r, 15));
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
      }
    }
    const sample = () =>
      Array.from({ length: 3 }, (_, slot) =>
        Array.from({ length: 13 }, (_, field) =>
          call("test_read", Module._WebTestReplayCarAddress(), slot, field),
        ),
      );
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Capture failed");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, name) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(name + " differs");
    };
    const types = () => new TextDecoder().decode(new Uint8Array(digest()));
    const health = Module._WebTestPlaceWeaponTarget(4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(6);
    await steps(1, 1);
    const launch = sample();
    if (launch.some((m) => !m[0] || m[3] !== 1) || new Set(launch.map((m) => m[0])).size !== 3)
      throw Error("Original volley failed: " + JSON.stringify(launch));
    equal(
      launch.map((m) => m[10]),
      [22, 22, 23],
      "Profiles",
    );
    equal(
      launch.map((m) => m[7]),
      [600, 600, 340],
      "Initial damage",
    );
    // The same speed inheritance is added to both base speeds; profile 23 is +1000.
    if (launch[0][11] !== launch[1][11] || launch[2][11] - launch[0][11] !== 1000)
      throw Error("Original speeds changed");
    if (launch[0][12] - launch[2][12] < 450) throw Error("Profile 23 lost its -512 local Y offset");
    await steps(6);
    const flying = sample();
    if (flying.some((m) => !m[0] || m[2]))
      throw Error("Volley did not remain in flight: " + JSON.stringify(flying));
    const smoke = types().split("tm3Sprite").length - 1;
    if (smoke !== 6)
      throw Error("Profile 23 should emit one original smoke sprite per tick: " + smoke);
    await globalThis.capturePhase("flying");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error("Capture failed: " + tm4Port.portableCheckpointError);
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick,
      saved = digest();
    await steps(8);
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    await steps(8);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Replay failed");
    equal(expected, digest(), "Primeval replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("Portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(saved, digest(), "Primeval portable snapshot");
    await steps(8);
    equal(expected, digest(), "Primeval portable replay");
    const impacts = [null, null, null];
    let totalDamage = 0;
    for (let i = 0; i < 85; ++i) {
      const before = sample(),
        oldHealth = Module._WebTestWeaponTargetHealth();
      await steps(1);
      const after = sample();
      const delta = oldHealth - Module._WebTestWeaponTargetHealth();
      let expectedDamage = 0;
      for (let j = 0; j < 3; ++j) {
        if (impacts[j]) continue;
        const a = before[j],
          b = after[j];
        if (j < 2 && a[0] && !a[2] && b[2] > 0 && !b[9] && b[1] < 61) {
          impacts[j] = b;
          expectedDamage += 600;
        }
        if (j === 2 && a[0] && !b[0] && !a[9] && a[1] < 60) {
          impacts[j] = a;
          expectedDamage += 340;
        }
      }
      if (delta !== expectedDamage)
        throw Error(
          "Unexpected direct damage: " + JSON.stringify({ delta, expectedDamage, before, after }),
        );
      totalDamage += delta;
      if (types().includes("tm3Explosion"))
        throw Error("Primeval incorrectly used Roadkill's area burst");
    }
    const contactHealth = Module._WebTestWeaponTargetHealth(),
      expired = sample();
    if (
      impacts.some((m) => !m) ||
      totalDamage !== 1540 ||
      health - contactHealth !== 1540 ||
      expired.some((m) => m[0])
    )
      throw Error(
        "Primeval impacts/expiry failed: " +
          JSON.stringify({ health, contactHealth, totalDamage, impacts, expired }),
      );
    // The second volley exercises world impacts: 22/22 linger, while 23 disappears.
    if (!Module._WebTestAimAtWeakDestroyable()) throw Error("Cannot prepare world hit");
    Module._WebTestPlaceWeaponTarget(-4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(1, 1);
    let world = null;
    for (let i = 0; i < 30; ++i) {
      await steps(1);
      const s = sample();
      if (s.some((m) => m[0] && m[9] && !m[2])) {
        world = s;
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
    if (!tm4Port.destroyableHits || tm4Port.lastDestroyableHit?.survived)
      throw Error("Original world impact did not destroy its target");
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
    if (!Module._WebNetCapturePortableCheckpoint()) throw Error("Final capture failed");
    const final = new TextDecoder().decode(tm4Port.portableCheckpoint),
      sounds = ["tm3primeval", "tm3_s15", "tm3_s00"].filter((name) => final.includes(name));
    if (sounds.length) throw Error("Sound did not finish: " + sounds);
    return {
      launch,
      flying,
      smoke,
      impacts,
      health,
      contactHealth,
      totalDamage,
      world,
      portableBytes: portable.length,
      tick,
      unsupported: tm4Port.netMatch.unsupported,
    };
  });
  if (log.some((s) => s.startsWith("PAGEERROR") || s.includes("Aborted(")))
    throw Error("Browser runtime failed");
  console.log("PRIMEVAL", JSON.stringify(result));
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
} finally {
  await fixture.close();
}
