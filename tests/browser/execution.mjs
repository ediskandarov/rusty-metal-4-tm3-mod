/* global Module, tm4Port, stackSave, stackAlloc, stackRestore, HEAPU8, HEAPU32, getWasmTableEntry */
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { prepareFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    shared: { type: "string", default: "build/TM3.MR" },
    cars: { type: "string", default: "build/checks/cars" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    output: { type: "string", default: "build/checks/execution" },
  },
});
if (!values.disc) throw Error("Supply --disc TM4_DISC_DIRECTORY");

const mods = resolve(values.output, "fixture");
await prepareFixture(mods, values.shared, values.cars);

const roster = [
  ["Warthog", "wh", "warthog", "WARTHOG"],
  ["Axel", "ax", "axel", "AXEL"],
  ["Club Kid", "ck", "clubkid", "CLUBKID"],
  ["Darkside", "ds", "darkside", "DARKSIDE"],
  ["Firestarter", "fs", "firestarter", "FIRE"],
  ["Flower Power", "fp", "flower", "FPOWER"],
  ["Mr. Grimm", "gr", "grimm", "GRIMM"],
  ["Hammerhead", "hh", "hammerhead", "HAMMER"],
  ["Minion", "mn", "minion", "MINION"],
  ["Outlaw", "ol", "outlaw", "OUTLAW"],
  ["Primeval", "pv", "primeval", "PRIMEVAL"],
  ["Roadkill", "rk", "roadkill", "RDKILL"],
  ["Spectre", "sp", "spectre", "SPECTRE"],
  ["Sweet Tooth", "sw", "sweet", "SWEET"],
  ["Thumper", "th", "thumper", "THUMPER"],
  ["Auger", "ag", "auger", "AUGER"],
].map(([title, stem, directory, archive]) => ({
  title: "TM3 " + title,
  stem: "mtm3" + stem,
  directory: "tm3" + directory,
  file: archive + ".MR",
}));

// Each match installs all packages and places a different set of eight cars on the map.
for (const start of [0, 8]) {
  const cars = [...roster.slice(start), ...roster.slice(0, start)];
  const output = resolve(values.output, String(start / 8 + 1));
  const fixture = await openTm3Car({
    disc: values.disc,
    mods,
    site: resolve(values.site),
    output,
    cars,
    playerCount: 8,
  });
  try {
    const result = await fixture.page.evaluate(
      async (stems) => {
        function address(stem, name) {
          const mark = stackSave();
          try {
            const bytes = new TextEncoder().encode(name + "\0");
            const ptr = stackAlloc(bytes.length);
            HEAPU8.set(bytes, ptr);
            const slot = Module.ccall(
              "WebDynamicModuleExport",
              "number",
              ["string", "number"],
              [stem + ".sym", ptr],
            );
            return slot;
          } finally {
            stackRestore(mark);
          }
        }

        function call(stem, name, ...args) {
          const slot = address(stem, name);
          if (!slot) throw Error(stem + " does not export " + name);
          return getWasmTableEntry(slot)(...args);
        }
        const definitions = {
          mtm3wh: ["Warthog", "Warthog", "Warthog"],
          mtm3fp: ["Flower"],
          mtm3gr: ["Grimm"],
          mtm3mn: ["Freeze", "MinionCentral", "MinionSide", "MinionSide"],
          mtm3pv: ["PrimevalTumbling", "PrimevalTumbling", "PrimevalSkull"],
          mtm3rk: ["Roadkill"],
          mtm3sp: ["Spectre"],
        };
        function bindings() {
          const result = [];
          for (const [slot, stem] of stems.entries()) {
            const car = call(stems[0], "test_car", slot);
            for (const [projectile, suffix] of (definitions[stem] ?? []).entries()) {
              const name = "Tm3ProjectileType_" + suffix;
              const owner = suffix === "Freeze" ? "mtm3fx" : stem;
              const definition = address(owner, name);
              if (!definition) throw Error(owner + " missing definition " + name);
              if (owner !== "mtm3fx" && address("mtm3fx", name))
                throw Error(name + " still belongs to shared");
              const multiple = ["mtm3wh", "mtm3mn", "mtm3pv"].includes(stem);
              const missile = multiple
                ? call(stem, "test_read", car, projectile, 0)
                : call(stem, "test_read", car, 0);
              if (!missile || HEAPU32[missile >>> 2] !== definition)
                throw Error(stem + " projectile does not use module-owned " + name);
              result.push(name);
            }
          }
          return result;
        }
        let tick = 0;
        function step(buttons = 0) {
          for (let slot = 0; slot < stems.length; ++slot)
            if (!Module._WebNetSetInput(tick, slot, buttons, 0, 0))
              throw Error("Input rejected at tick " + tick + ", slot " + slot);
          if (!Module._WebNetQueueTick(tick++) || tm4Port.netMatch.tick !== tick)
            throw Error("Simulation did not reach tick " + tick);
          if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
        }
        for (let i = 0; i < 60; ++i) step();
        for (const [slot, stem] of stems.entries()) {
          // Both Warthog and Minion, the lead modules, expose the slot lookup.
          const car = call(stems[0], "test_car", slot);
          if (!car) throw Error("Missing car in slot " + slot);
          call(stem, "test_select", car);
        }
        step(1);
        for (let i = 0; i < 5; ++i) step();
        const bound = bindings();
        if (!Module._WebNetCaptureLocalCheckpoint()) throw Error(tm4Port.localCheckpointError);
        if (!Module._WebNetCapturePortableCheckpoint())
          throw Error(tm4Port.portableCheckpointError);
        const snapshot = tm4Port.portableCheckpoint.slice();
        const text = new TextDecoder().decode(snapshot);
        for (const name of bound)
          if (!text.includes(name)) throw Error("Snapshot omitted definition key " + name);
        const checkpointTick = tick;
        function stateAfterTick() {
          step();
          if (!Module._WebNetCaptureState()) throw Error("Cannot capture tick " + tick);
          return tm4Port.netCapturedState;
        }
        const expected = Array.from({ length: 36 }, stateAfterTick);
        function verifyReplay(label) {
          tick = checkpointTick;
          for (const bytes of expected) {
            const actual = stateAfterTick();
            if (bytes.length !== actual.length || bytes.some((value, i) => value !== actual[i]))
              throw Error(label + " diverged at tick " + tick);
          }
        }
        if (!Module._WebNetRestoreLocalCheckpoint()) throw Error(tm4Port.localCheckpointError);
        bindings();
        verifyReplay("Local rollback");
        if (!Module._WebNetFinishLocalReplay()) throw Error(tm4Port.localCheckpointError);
        if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
          throw Error("Cannot start fresh match");
        Module._WebNetEndReplay();
        tm4Port.portableCheckpoint = snapshot;
        if (!Module._WebNetBeginPortableReplay()) throw Error(tm4Port.portableCheckpointError);
        Module._WebNetEndReplay();
        bindings();
        verifyReplay("Portable snapshot");
        return {
          cars: stems,
          definitions: bound,
          checkpointTick,
          bytes: snapshot.length,
          replayTicks: expected.length,
        };
      },
      cars.slice(0, 8).map((car) => car.stem),
    );
    await Bun.write(resolve(output, "result.json"), JSON.stringify(result, null, 2));
    console.log(
      "PASS",
      cars
        .slice(0, 8)
        .map((car) => car.title)
        .join(", "),
    );
  } finally {
    await fixture.close();
  }
}
