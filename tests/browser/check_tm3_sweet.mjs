/* global Module, tm4Port, stackSave, stackAlloc, stackRestore, getWasmTableEntry, HEAPU8, HEAP16, HEAPU32 */
import { mkdir } from "node:fs/promises";
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
    output: { type: "string", default: "build/checks/tm3-sweet" },
  },
});
if (!values.disc)
  throw Error(
    "Usage: bun tests/browser/check_tm3_sweet.mjs --disc TM4_DISC_DIRECTORY [--site BUILD/site] [--mods BUILD/mods]",
  );
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const mods = resolve(values.mods);
const site = resolve(values.site);
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const fixture = await openTm3Car({
  disc: values.disc,
  site,
  mods,
  output,
  cars: [{ stem: "mtm3sw", title: "TM3 Tooth", directory: "tm3sweet", file: "SWEET.MR" }],
});
const { page, log } = fixture;
try {
  const result = await page.evaluate(async () => {
    const car = Module._WebTestReplayCarAddress();
    function moduleCall(module, name, ...args) {
      const lib = globalThis.LDSO.loadedLibsByName[`/modules/${module}.wasm`];
      if (!lib) throw Error("Custom module was not loaded");
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
    const call = (name, ...args) => moduleCall("mtm3sw", name, ...args);
    // The original shared weapon meshes use the SDK projection and private
    // texture bank too. Exercise every descriptor, both packet forms and bounds.
    const savedGeometryStack = stackSave();
    const weaponDraws = [];
    try {
      const matrix = stackAlloc(32),
        view = stackAlloc(32);
      const ordering = stackAlloc(2048 * 8),
        packets = stackAlloc(16384);
      const cursor = stackAlloc(4);
      for (const p of [matrix, view]) {
        HEAPU8.fill(0, p, p + 32);
        for (const i of [0, 4, 8]) HEAP16[p / 2 + i] = 4096;
      }
      HEAPU32[(matrix + 28) / 4] = 4096;
      function draw(descriptor, budget = 16384) {
        HEAPU8.fill(0, ordering, ordering + 2048 * 8);
        HEAPU8.fill(0xa5, packets, packets + 16384);
        HEAPU32[cursor / 4] = packets;
        moduleCall(
          "mtm3fx",
          "Tm3DisplayWeaponGroup",
          descriptor,
          0,
          -1,
          matrix,
          ordering,
          cursor,
          packets + budget,
          view,
        );
        const used = HEAPU32[cursor / 4] - packets;
        if (used < 0 || used > budget) throw Error("Weapon renderer exceeded its packet budget");
        return HEAPU8.slice(packets, packets + used);
      }
      for (let group = 0; group < 9; ++group) {
        const a = draw(group * 8),
          b = draw(group * 8);
        if (!a.length || a.length !== b.length || a.some((v, i) => v !== b[i]))
          throw Error("Original weapon mesh failed deterministic drawing: " + group);
        weaponDraws.push(a.length);
        // PsyZ uses an 8-byte packet tag, then color/command, XY0/UV0, XY1/UV1.
        if (a[8] !== 128 || ![0x24, 0x26, 0x2c, 0x2e].includes(a[11]))
          throw Error("Weapon shade or primitive command changed");
        const page = a[26] | (a[27] << 8);
        if (!(page & 0x1e00)) throw Error("Weapon material lost its private texture bank");
      }
      if (draw(0, 1).length || HEAPU8[packets] !== 0xa5)
        throw Error("Exhausted weapon packet buffer was written");
      if (draw(0xffffffff).length) throw Error("Invalid weapon descriptor was drawn");
      HEAPU32[(matrix + 28) / 4] = -4096;
      if (draw(0).length) throw Error("Behind-camera weapon mesh was drawn");
    } finally {
      stackRestore(savedGeometryStack);
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
    const sample = () => Array.from({ length: 7 }, (_, i) => call("test_read", car, i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("No state capture");
      return Array.from(tm4Port.netCapturedState);
    };
    Module._WebTestPlaceWeaponTarget(-3000);
    call("test_select", car);
    await steps(6);
    const rest = sample();
    const engineSample = () =>
      Array.from({ length: 8 }, (_, i) =>
        call("test_read", Module._WebTestReplayCarAddress(), 9 + i),
      );
    const engineRest = engineSample();
    if (
      !engineRest[1] ||
      engineRest[2] !== 1326 + engineRest[3] ||
      engineRest[4] !== 1 ||
      engineRest[5] !== Math.trunc((127 * 100) / 256) ||
      engineRest[6] !== -1 ||
      engineRest[7] < 0
    )
      throw Error("Original engine was not initialized: " + engineRest);
    await steps(1, 1);
    const launch = sample();
    if (!launch[0]) throw Error("The game input did not launch the head");
    await steps(8);
    const checkpoint = Module._WebNetCaptureLocalCheckpoint();
    if (!checkpoint) throw Error("Checkpoint failed: " + tm4Port.localCheckpointError);
    const checkpointTick = tick;
    if (!Module._WebNetCapturePortableCheckpoint())
      throw Error("Portable capture failed: " + tm4Port.portableCheckpointError);
    const portable = tm4Port.portableCheckpoint.slice();
    const portableExpected = digest();
    await globalThis.capturePhase("flying");
    await steps(2);
    const flying = sample();
    await steps(1, 1);
    const detonated = sample();
    await steps(5);
    await globalThis.capturePhase("burst");
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint())
      throw Error("Restore failed: " + tm4Port.localCheckpointError);
    tick = checkpointTick;
    await steps(2);
    await steps(1, 1);
    await steps(5);
    if (!Module._WebNetFinishLocalReplay())
      throw Error("Finish replay failed: " + tm4Port.localCheckpointError);
    const actual = digest();
    if (expected.length !== actual.length || expected.some((v, i) => v !== actual[i]))
      throw Error("Replay state differs");
    await steps(1, 1);
    const cooldownBlocked = sample();
    if (cooldownBlocked[0] || cooldownBlocked[4] !== 1)
      throw Error("Detonation did not start the original launch cooldown");
    await steps(26);
    await steps(1, 1);
    await steps(62);
    const expired = sample();
    const expiryCooldown = call("test_read", Module._WebTestReplayCarAddress(), 17);
    if (expiryCooldown <= 0) throw Error("Expiry did not start the original launch cooldown");
    const restarted = await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], {
      async: true,
    });
    if (!restarted) throw Error("Fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("Portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = checkpointTick;
    const restored = digest();
    if (
      restored.length !== portableExpected.length ||
      restored.some((v, i) => v !== portableExpected[i])
    )
      throw Error("Portable state differs after a fresh match");
    await steps(2);
    await steps(1, 1);
    await steps(5);
    const fresh = digest();
    if (fresh.length !== expected.length || fresh.some((v, i) => v !== expected[i]))
      throw Error("Portable replay differs");
    const soundNames = ["tm3sweet", "tm3_s00", "tm3_s26"];
    const attackSounds = () => {
      if (!Module._WebNetCapturePortableCheckpoint())
        throw Error("Sound snapshot failed: " + tm4Port.portableCheckpointError);
      const state = new TextDecoder().decode(tm4Port.portableCheckpoint);
      return soundNames.filter((name) => state.includes(name));
    };
    const targetHealth = Module._WebTestPlaceWeaponTarget(1000);
    if (targetHealth <= 0) throw Error("Could not place the car contact target");
    await steps(31);
    await steps(1, 1);
    await steps(20);
    const contactHealth = Module._WebTestWeaponTargetHealth();
    const contactAmmo = call("test_read", Module._WebTestReplayCarAddress(), 4);
    if (contactAmmo !== 0 || contactHealth >= targetHealth)
      throw Error("The original head contact/burst did not damage the other car");
    const contactSounds = attackSounds();
    if (!contactSounds.includes("tm3_s26"))
      throw Error("Contact did not play the original explosion");
    // Exercise turbo through the regular controller input, including its release tail.
    Module._WebTestPlaceWeaponTarget(-3000);
    await steps(30);
    // Attack particles have expired; remaining shared sprites belong to turbo.
    const turboSample = () => [
      call("test_read", Module._WebTestReplayCarAddress(), 7),
      call("test_read", Module._WebTestReplayCarAddress(), 8),
      new TextDecoder().decode(new Uint8Array(digest())).split("tm3Sprite").length - 1,
    ];
    const turboRest = turboSample();
    if (turboRest[1] || turboRest[2]) throw Error("Turbo smoke exists before turbo");
    await steps(2, 0x40);
    await steps(2);
    await steps(6, 0x40);
    const turboActive = turboSample();
    const engineActive = engineSample();
    if (engineActive[2] !== 1326 + engineActive[3] || engineActive[2] <= engineRest[2])
      throw Error("Engine pitch did not follow the original rev curve: " + engineActive);
    if (!turboActive[1] || turboActive[0] >= turboRest[0] || turboActive[2] !== 6)
      throw Error("Turbo did not emit one original smoke sprite per tick: " + turboActive);
    await globalThis.capturePhase("turbo");
    if (!Module._WebNetCaptureLocalCheckpoint()) throw Error("Turbo checkpoint failed");
    const turboTick = tick;
    if (!Module._WebNetCapturePortableCheckpoint()) throw Error("Turbo portable capture failed");
    const turboPortable = tm4Port.portableCheckpoint.slice();
    const turboBefore = digest();
    await steps(10, 0x40);
    await globalThis.capturePhase("turbo-trail");
    const turboExpected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Turbo restore failed");
    tick = turboTick;
    await steps(10, 0x40);
    if (!Module._WebNetFinishLocalReplay()) throw Error("Turbo replay failed");
    const turboActual = digest();
    if (
      turboExpected.length !== turboActual.length ||
      turboExpected.some((v, i) => v !== turboActual[i])
    )
      throw Error("Turbo smoke replay differs");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Turbo fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = turboPortable;
    if (!Module._WebNetBeginPortableReplay()) throw Error("Turbo portable restore failed");
    Module._WebNetEndReplay();
    tick = turboTick;
    const turboRestored = digest();
    if (
      turboBefore.length !== turboRestored.length ||
      turboBefore.some((v, i) => v !== turboRestored[i])
    )
      throw Error("Turbo smoke portable state differs");
    await steps(10, 0x40);
    const turboFresh = digest();
    if (
      turboExpected.length !== turboFresh.length ||
      turboExpected.some((v, i) => v !== turboFresh[i])
    )
      throw Error("Turbo smoke portable replay differs");
    await steps(1);
    const turboReleased = turboSample();
    if (turboReleased[1] || !turboReleased[2]) throw Error("Turbo release lost its smoke tail");
    await globalThis.capturePhase("turbo-released");
    await steps(24);
    const turboCleared = turboSample();
    if (turboCleared[2]) throw Error("Turbo smoke did not expire");
    await steps(120);
    const remainingAttackSounds = attackSounds();
    if (remainingAttackSounds.length)
      throw Error("Attack sounds kept playing after their samples ended: " + remainingAttackSounds);
    const engineAfterRestore = engineSample();
    if (!engineAfterRestore[1] || engineAfterRestore[4] !== 1 || engineAfterRestore[6] !== -1)
      throw Error("Engine loop was lost after snapshot restoration");
    return {
      weaponDraws,
      cooldownBlocked,
      expiryCooldown,
      engineRest,
      engineActive,
      engineAfterRestore,
      contactSounds,
      remainingAttackSounds,
      turboRest,
      turboActive,
      turboReleased,
      turboCleared,
      targetHealth,
      contactHealth,
      contactAmmo,
      rest,
      launch,
      flying,
      detonated,
      expired,
      tick,
      checkpoint,
      replayedBytes: actual.length,
      portableBytes: portable.length,
      unsupported: tm4Port.netMatch.unsupported,
    };
  });
  if (log.some((line) => line.startsWith("PAGEERROR") || line.includes("Aborted(")))
    throw Error(
      "Browser runtime failed: " + log.filter((line) => line.includes("Aborted(")).join("\n"),
    );
  console.log("SWEET", JSON.stringify(result));
  if (
    !result.launch[0] ||
    result.launch[4] !== 2 ||
    result.detonated[0] ||
    result.detonated[4] !== 1 ||
    result.expired[0] ||
    result.expired[4] !== 0
  )
    throw Error("Sweet Tooth lifecycle mismatch");
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
} finally {
  await fixture.close();
}
