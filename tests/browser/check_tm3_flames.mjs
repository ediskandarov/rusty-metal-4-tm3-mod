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
    output: { type: "string", default: "build/checks/tm3-flames" },
  },
});
if (!values.disc)
  throw Error("Usage: bun tests/browser/check_tm3_flames.mjs --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const output = resolve(values.output);
for (const [stem, title, file] of [
  ["mtm3fs", "Firestarter", "FIRE.MR"],
  ["mtm3ds", "Darkside", "DARKSIDE.MR"],
]) {
  const fixture = await openTm3Car({
    disc: values.disc,
    site: resolve(values.site),
    mods: resolve(values.mods),
    output: resolve(output, title),
    cars: [
      {
        stem,
        title: "TM3 " + title,
        directory: "tm3" + title.toLowerCase(),
        file,
      },
    ],
  });
  const { page } = fixture;
  try {
    const result = await page.evaluate(async (stem) => {
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
            [stem + ".sym", p],
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
        Array.from({ length: 6 }, (_, i) =>
          call("test_read", Module._WebTestReplayCarAddress(), i),
        );
      const digest = () => {
        if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
        return Array.from(tm4Port.netCapturedState);
      };
      const equal = (a, b, label) => {
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw Error(label + " differs");
      };
      const dark = stem === "mtm3ds";
      let freeze = 0;
      if (dark) {
        if (call("test_rear_groups", Module._WebTestReplayCarAddress()) !== 3)
          throw Error("Rear wheel group poses");
        Module._WebTestPlaceWeaponTarget(4000);
        call("test_select", Module._WebTestReplayCarAddress());
        await steps(6);
        await steps(1, 1);
        for (let i = 0; i < 100; ++i) {
          await steps(1);
          freeze = Math.max(freeze, sample()[5]);
        }
        if (!freeze) throw Error("Darkside freeze projectile missed at distance");
        if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
          throw Error("Second match setup failed");
        Module._WebNetEndReplay();
        tick = 0;
      } else {
        await steps(8, 32768);
        const car = Module._WebTestReplayCarAddress(),
          steer = call("test_read", car, 7);
        if (!steer || call("test_read", car, 6) !== 2 * steer) throw Error("Steering body pose");
      }
      await steps(55);
      const health = Module._WebTestPlaceWeaponTarget(800);
      call("test_select", Module._WebTestReplayCarAddress());
      await steps(6);
      const before = sample();
      await steps(1, 1);
      const launch = sample();
      if (launch[0] !== before[0] - 1 || launch[1] !== 1 || launch[4] !== Number(dark))
        throw Error("Launch differs " + JSON.stringify({ before, launch }));
      let first;
      for (let i = 0; i < 25; ++i) {
        await steps(1);
        first = sample();
        freeze = Math.max(freeze, first[5]);
        if (first[3] && first[2] && (!dark || freeze > 0)) break;
      }
      if (
        !first[1] ||
        !first[2] ||
        !first[3] ||
        (dark && !freeze) ||
        Module._WebTestWeaponTargetHealth() >= health
      )
        throw Error(
          "Flame contact " +
            JSON.stringify({
              launch,
              first,
              health,
              hp: Module._WebTestWeaponTargetHealth(),
              freeze,
            }),
        );
      if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
        throw Error(
          "Mid-flame capture failed " +
            tm4Port.localCheckpointError +
            " " +
            tm4Port.portableCheckpointError,
        );
      const portable = tm4Port.portableCheckpoint.slice(),
        savedTick = tick;
      async function drive() {
        const trace = [];
        for (let i = 0; i < 175; ++i) {
          await steps(1);
          trace.push([...sample(), Module._WebTestWeaponTargetHealth()]);
        }
        return trace;
      }
      const hits = await drive(),
        last = hits.at(-1);
      if (last.slice(1, 6).some(Boolean) || last[6] >= health - 30 || !hits.some((s) => s[2] >= 5))
        throw Error(
          "Flame duration or damage " +
            JSON.stringify({
              last,
              health,
              peak: Math.max(...hits.map((s) => s[2])),
            }),
        );
      const expected = digest();
      if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Local restore failed");
      tick = savedTick;
      equal(hits.flat(), (await drive()).flat(), "Local flame");
      if (!Module._WebNetFinishLocalReplay()) throw Error("Local replay failed");
      equal(expected, digest(), "Local digest");
      if (
        !(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], {
          async: true,
        }))
      )
        throw Error("Restart failed");
      Module._WebNetEndReplay();
      tm4Port.portableCheckpoint = portable;
      if (!Module._WebNetBeginPortableReplay()) throw Error("Portable restore failed");
      Module._WebNetEndReplay();
      tick = savedTick;
      equal(hits.flat(), (await drive()).flat(), "Portable flame");
      equal(expected, digest(), "Portable digest");
      if (!dark) {
        const car = Module._WebTestReplayCarAddress();
        const read = (field) => call("test_read", car, field);
        const ground = call("test_ground_fire", car);
        await steps(2);
        if (!ground || read(3) !== 1) throw Error("Ground fire did not ignite the car");
        call("test_remove_fire", ground);
        // Double-tap the accelerator. The last 20 fuel units buy exactly one boost.
        for (const fuel of [0, 19, 20]) {
          call("test_set_fuel", car, fuel);
          await steps(1, 0x40);
          await steps(1);
          const health = read(9);
          await steps(1, 0x40);
          const after = { fuel: read(8), thrust: read(10), burns: read(3), health: read(9) };
          if (
            after.fuel !== 0 ||
            after.thrust !== Number(fuel === 20) ||
            after.burns !== Number(fuel < 20) ||
            (fuel === 20 ? after.health !== health : after.health >= health)
          )
            throw Error("Turbo extinguish " + JSON.stringify({ fuel, health, after }));
          await steps(16);
        }
        // Leave the ground source in place this time. After one paid boost the
        // same hazard must be able to set the car on fire again.
        const hazard = call("test_ground_fire", car);
        await steps(2);
        const firstBurn = read(11);
        if (!hazard || firstBurn < 0 || read(3) !== 1) throw Error("Second ground fire missed");
        call("test_set_fuel", car, 20);
        await steps(1, 0x40);
        await steps(1);
        await steps(1, 0x40);
        if (!read(10)) throw Error("No thrust over ground fire");
        await steps(2);
        if (read(3) !== 1 || read(11) < 0 || read(11) === firstBurn)
          throw Error("Ground fire did not reignite the car");
      }
      return {
        before,
        launch,
        first,
        health,
        freeze,
        last,
        comparedTicks: hits.length,
      };
    }, stem);
    await Bun.write(resolve(output, title, "result.json"), JSON.stringify(result, null, 2));
    console.log(title, result);
  } finally {
    await fixture.close();
  }
}
