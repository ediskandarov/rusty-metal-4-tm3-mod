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
    output: { type: "string", default: "build/checks/tm3-minion" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_minion.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
const fixture = await openTm3Car({
  disc: values.disc,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output,
  cars: [{ stem: "mtm3mn", title: "TM3 Minion", directory: "tm3minion", file: "MINION.MR" }],
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
          ["mtm3mn.sym", p],
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
      Array.from({ length: 4 }, (_, slot) =>
        Array.from({ length: 15 }, (_, field) =>
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
    if (call("test_rear_groups", Module._WebTestReplayCarAddress()) !== 3)
      throw Error("Custom wheel groups failed rotation or suspension at their own pivot");
    const health = Module._WebTestPlaceWeaponTarget(4000);
    call("test_select", Module._WebTestReplayCarAddress());
    await steps(6);
    await steps(1, 1);
    const launch = sample();
    if (launch.some((m) => !m[0] || m[3] !== 1) || new Set(launch.map((m) => m[0])).size !== 4)
      throw Error("Expected four projectiles and one spent charge: " + JSON.stringify(launch));
    equal(
      launch.map((m) => m[10]),
      [3, 19, 20, 20],
      "Profiles",
    );
    equal(
      launch.map((m) => m[7]),
      [200, 600, 300, 300],
      "Damage",
    );
    if (
      launch[1][12] - launch[0][12] < 195 ||
      (launch[2][5] === launch[3][5] && launch[2][6] === launch[3][6])
    )
      throw Error("Launch origins: " + JSON.stringify(launch));
    await steps(6);
    await globalThis.capturePhase("volley");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error("Capture failed: " + tm4Port.portableCheckpointError);
    const portable = tm4Port.portableCheckpoint.slice(),
      savedTick = tick,
      saved = digest();
    async function runVolley() {
      const contacts = [];
      for (let i = 0; i < 120; ++i) {
        const before = sample()[0];
        await steps(1);
        const after = sample()[0];
        if (before[14] !== after[14] || after[13] > before[13])
          contacts.push({ age: i, health: after[14], frozen: after[13] });
      }
      return contacts;
    }
    const contacts = await runVolley();
    if (
      !contacts.some((c) => c.frozen === 90) ||
      sample()[0][14] !== health - 1400 ||
      sample().some((m) => m[0]) ||
      sample()[0][13] !== 0
    )
      throw Error(
        "Minion volley or thaw: " + JSON.stringify({ health, contacts, final: sample() }),
      );
    const expected = digest();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
    tick = savedTick;
    if (JSON.stringify(await runVolley()) !== JSON.stringify(contacts))
      throw Error("Impact replay differs");
    if (!Module._WebNetFinishLocalReplay()) throw Error("Replay failed");
    equal(expected, digest(), "Minion replay");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Fresh match failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = portable;
    if (!Module._WebNetBeginPortableReplay())
      throw Error("Portable restore failed: " + tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    tick = savedTick;
    equal(saved, digest(), "Minion portable snapshot");
    if (JSON.stringify(await runVolley()) !== JSON.stringify(contacts))
      throw Error("Impact replay differs");
    equal(expected, digest(), "Minion portable replay");
    return { launch, contacts };
  });
  if (log.some((s) => s.startsWith("PAGEERROR") || s.includes("Aborted(")))
    throw Error("Browser runtime failed");
  console.log("MINION", JSON.stringify(result));
  await Bun.write(output + "/result.json", JSON.stringify(result, null, 2));
} finally {
  await fixture.close();
}
