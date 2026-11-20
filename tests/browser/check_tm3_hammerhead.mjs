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
    output: { type: "string", default: "build/checks/tm3-hammerhead" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_hammerhead.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [
    { stem: "mtm3hh", title: "TM3 Hammerhead", directory: "tm3hammerhead", file: "HAMMER.MR" },
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
          ["mtm3hh.sym", p],
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
      Array.from({ length: 4 }, (_, i) => call("test_read", Module._WebTestReplayCarAddress(), i));
    const digest = () => {
      if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
      return Array.from(tm4Port.netCapturedState);
    };
    const equal = (a, b, label) => {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(label + " differs");
    };
    await steps(60, 64);
    const health = Module._WebTestPlaceWeaponTarget(700);
    call("test_select", Module._WebTestReplayCarAddress());
    const before = sample();
    await steps(1, 65);
    const launch = sample();
    if (launch[0] !== 59 || launch[2] !== before[2] - 1)
      throw Error("Launch failed " + JSON.stringify({ before, launch }));
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(
        "Capture failed " + tm4Port.localCheckpointError + " " + tm4Port.portableCheckpointError,
      );
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick;
    async function drive() {
      const trace = [];
      let fireAmmo;
      for (let i = 1; i <= 61; ++i) {
        if (i === 1) {
          fireAmmo = Module._WebTestEquipWeapon(1);
          if (!fireAmmo) throw Error("Cannot equip Fire during the special");
        }
        if (i === 36) call("test_select", Module._WebTestReplayCarAddress());
        await steps(1, 64 | (i === 2 || i === 36 ? 1 : 0));
        if (i === 2) {
          const ammo = call("test_read", Module._WebTestReplayCarAddress(), 6);
          if (ammo !== fireAmmo - 1 || sample()[0] <= 0)
            throw Error("Fire was blocked during the active special");
        }
        const state = sample();
        const hp = Module._WebTestWeaponTargetHealth();
        if (state[0] !== Math.max(0, launch[0] - i) || state[2] !== launch[2])
          throw Error("Timer or firing on tick " + i + ": " + state);
        trace.push([state[3], hp]);
      }
      return trace;
    }
    const hits = await drive();
    if (!hits.some(([id, hp]) => id && hp <= health - 600) || hits.at(-1)[0] !== 0)
      throw Error("Expected a live ram and expiry " + JSON.stringify({ health, hits }));
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    equal(hits.flat(), (await drive()).flat(), "Local ram");
    if (!Module._WebNetFinishLocalReplay()) throw Error("Local replay failed");
    equal(expected, digest(), "Local digest");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Restart failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay()) throw Error("Portable restore failed");
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(hits.flat(), (await drive()).flat(), "Portable ram");
    equal(expected, digest(), "Portable digest");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Mid-contact setup restart failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay()) throw Error("Mid-contact setup failed");
    Module._WebNetEndReplay();
    tick = savedTick;
    await steps(6, 64);
    const contact = sample();
    if (!contact[3] || !Module._WebNetCapturePortableCheckpoint())
      throw Error("Failed to capture a marked target: " + contact);
    const marked = tm4Port.portableCheckpoint.slice();
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Mid-contact restart failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = marked;
    if (!Module._WebNetBeginPortableReplay()) throw Error("Mid-contact restore failed");
    Module._WebNetEndReplay();
    equal(contact, sample(), "Previously hit target");
    // Start the next ram on the first tick after expiry, before an idle process clears hits.
    await steps(contact[0], 64);
    Module._WebTestPlaceWeaponTarget(4000);
    call("test_select", Module._WebTestReplayCarAddress());
    const nextAmmo = sample()[2];
    await steps(1, 65);
    const nextRam = sample();
    if (nextRam[0] !== 59 || nextRam[2] !== nextAmmo - 1 || nextRam[3] !== 0)
      throw Error("Next ram must start with a fresh hit list: " + nextRam);
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Rear setup failed");
    tick = 0;
    await steps(55);
    call("test_select", Module._WebTestReplayCarAddress());
    for (const button of [8192, 32768, 16384]) {
      await steps(1, button);
      await steps(1);
    }
    Module._WebTestPlaceWeaponTarget(-480);
    call("test_weaken_target");
    await steps(1, 16384);
    const rear = sample();
    if (rear[0] !== 59 || rear[1] !== 1 || rear[2] !== 1) throw Error("Rear combo failed: " + rear);
    await steps(12);
    if (!sample()[3] || call("test_read", Module._WebTestReplayCarAddress(), 4))
      throw Error("Lethal rear contact failed: " + sample());
    return { before, launch, health, hits, rear };
  });
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
  await page.locator("canvas").screenshot({ path: output + "/result.png" });
} finally {
  await fixture.close();
}
