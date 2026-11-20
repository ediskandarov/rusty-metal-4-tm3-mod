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
    output: { type: "string", default: "build/checks/tm3-warthog" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_warthog.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [{ stem: "mtm3wh", title: "TM3 Warthog", directory: "tm3warthog", file: "WARTHOG.MR" }],
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
          ["mtm3wh.sym", p],
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
      Array.from({ length: 3 }, (_, slot) =>
        Array.from({ length: 10 }, (_, field) =>
          call("test_read", Module._WebTestReplayCarAddress(), slot, field),
        ),
      );
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("State capture failed");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, name) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(name + " differs");
    };
    const ramp = (age) =>
      130 + Math.floor((Math.floor(((130 * (age << 12)) >>> 0) / 60) + 2048) / 4096);
    const checkRamp = (s) => {
      for (const m of s)
        if (m[0] && m[7] !== ramp(m[1])) throw Error("Warthog age damage changed: " + m);
    };
    const health = Module._WebTestPlaceWeaponTarget(4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(6);
    await steps(1, 1);
    const launch = sample();
    if (
      launch.some((m) => !m[0] || m[3] !== 1 || m[7] !== 130) ||
      new Set(launch.map((m) => m[0])).size !== 3
    )
      throw Error("Warthog volley/ammo failed: " + JSON.stringify(launch));
    equal(
      launch.map((m) => m[8]),
      [0x161616, 0x1f, 0x1f0000],
      "Original white/red/blue trail gradients",
    );
    if (new Set(launch.map((m) => m[5] + "," + m[6])).size !== 3)
      throw Error("Original launch mounts collapsed");
    await steps(3);
    const flying = sample();
    checkRamp(flying);
    if (flying.some((m) => !m[0] || m[2]))
      throw Error("Volley did not remain in flight: " + JSON.stringify(flying));
    await globalThis.capturePhase("flying");
    if (!Module._WebNetCaptureLocalCheckpoint())
      throw Error("Local capture failed: " + tm4Port.localCheckpointError);
    if (!Module._WebNetCapturePortableCheckpoint())
      throw Error("Portable capture failed: " + tm4Port.portableCheckpointError);
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick,
      saved = digest();
    await steps(16);
    const expected = digest();
    checkRamp(sample());
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    await steps(16);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Local replay failed");
    equal(expected, digest(), "Volley replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("Portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(saved, digest(), "Volley portable snapshot");
    await steps(16);
    equal(expected, digest(), "Volley portable replay");
    const impacts = [null, null, null];
    for (let i = 0; i < 80; ++i) {
      const volley = sample();
      checkRamp(volley);
      for (let j = 0; j < 3; ++j) if (!impacts[j] && volley[j][2] > 0) impacts[j] = volley[j];
      await steps(1);
    }
    const contactHealth = Module._WebTestWeaponTargetHealth();
    if (
      impacts.some((m) => !m || m[9] || m[3] !== 1) ||
      health - contactHealth !== impacts.reduce((n, m) => n + m[7], 0)
    )
      throw Error(
        "Three ranged hits/ramped damage failed: " +
          JSON.stringify({ health, contactHealth, impacts }),
      );
    const expired = sample();
    if (expired.some((m) => m[0] || m[3] !== 1)) throw Error("Volley did not expire");
    if (!Module._WebTestAimAtWeakDestroyable())
      throw Error("Cannot prepare original wall/destructible test");
    Module._WebTestPlaceWeaponTarget(-4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(1, 1);
    let wall = null;
    for (let i = 0; i < 35; ++i) {
      await steps(1);
      const s = sample();
      if (s.some((m) => m[0] && m[9] && !m[2])) {
        wall = s;
        break;
      }
    }
    if (!wall) throw Error("World collision was not retained for next-tick resolution");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error("Pending world-hit capture failed");
    const wallTick = tick,
      wallPortable = tm4Port.portableCheckpoint.slice(),
      wallSaved = digest();
    await steps(8);
    const wallExpected = digest(),
      wallAfter = sample();
    Module._WebTestDestroyablePresent();
    const destruction = { hits: tm4Port.destroyableHits, last: tm4Port.lastDestroyableHit };
    if (!destruction.hits || destruction.last?.survived)
      throw Error(
        "Original missile did not damage the TM4 destroyable: " + JSON.stringify(destruction),
      );
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("World-hit local restore failed");
    tick = wallTick;
    await steps(8);
    if (!Module._WebNetFinishLocalReplay()) throw Error("World-hit replay failed");
    equal(wallExpected, digest(), "Pending world-hit replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Wall fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = wallPortable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("World-hit portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = wallTick;
    equal(wallSaved, digest(), "World-hit portable snapshot");
    await steps(8);
    equal(wallExpected, digest(), "World-hit portable replay");
    await steps(120);
    if (!Module._WebNetCapturePortableCheckpoint()) throw Error("Final capture failed");
    const final = new TextDecoder().decode(tm4Port.portableCheckpoint);
    const sounds = ["tm3warthog", "tm3_s15", "tm3_s00"].filter((name) => final.includes(name));
    if (sounds.length) throw Error("Attack sound did not finish: " + sounds);
    return {
      launch,
      flying,
      expired,
      impacts,
      health,
      contactHealth,
      wall,
      wallAfter,
      destruction,
      portableBytes: portable.length,
      tick,
      unsupported: tm4Port.netMatch.unsupported,
    };
  });
  if (log.some((s) => s.startsWith("PAGEERROR") || s.includes("Aborted(")))
    throw Error("Browser runtime failed");
  console.log("WARTHOG", JSON.stringify(result));
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
} finally {
  await fixture.close();
}
