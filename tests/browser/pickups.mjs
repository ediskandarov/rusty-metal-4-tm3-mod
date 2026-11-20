/* global Module, tm4Port */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { mapBehaviors } from "../../apps/build-maps/src/behavior.ts";
import { maps } from "../../apps/build-maps/src/catalog.ts";
import { readMr } from "../../external/rusty-metal-4/packages/resources/src/compatibility/mr.ts";
import { prepareFixture, prepareMapFixture } from "./fixture.mjs";
import { checkPickupLighting } from "./helpers/pickup-lighting.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    map: { type: "string", multiple: true },
    maps: { type: "string", default: "build/maps" },
    shared: { type: "string", default: "build/TM3.MR" },
    cars: { type: "string", default: "build/checks/cars" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    output: { type: "string", default: "build/checks/pickups" },
  },
});
if (!values.disc) throw Error("Supply --disc TM4_DISC_DIRECTORY");
for (const id of values.map ?? [])
  if (!maps.some((map) => map.id === id)) throw Error("Unknown map " + id);
const mods = resolve(values.output, "fixture");
await prepareFixture(mods, values.shared, values.cars);
for (const map of maps.filter((map) => !values.map || values.map.includes(map.id))) {
  const output = resolve(values.output, map.id);
  const root = (
    await readMr(
      new Uint8Array(await Bun.file(resolve(values.maps, map.file + ".MR")).arrayBuffer()),
    )
  ).root;
  const module = mapBehaviors[map.id]?.module;
  const { site, archive } = prepareMapFixture(root, module, values.site);
  const fixture = await openTm3Car({
    disc: values.disc,
    site,
    mods,
    output,
    world: {
      stem: "tm3map",
      archive,
      imageArchive: new Uint8Array(
        await Bun.file(resolve(values.maps, map.file + ".IMG")).arrayBuffer(),
      ),
    },
    cars: [{ stem: "mtm3sw", title: "TM3 Sweet Tooth", directory: "tm3sweet", file: "SWEET.MR" }],
  });
  try {
    await checkPickupLighting(fixture.page);
    const result = await fixture.page.evaluate(async () => {
      let tick = 0;
      const step = () => {
        for (let slot = 0; slot < 2; ++slot)
          if (!Module._WebNetSetInput(tick, slot, 0, 0, 0)) throw Error("Input rejected");
        if (!Module._WebNetQueueTick(tick++)) throw Error("Tick rejected");
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
      };
      for (; tick < 30;) step();
      if (!Module._WebTestApproachPickup()) throw Error("No collectable weapon pickup");
      const start = tick;
      const pickup = { ...tm4Port.testPickup };
      if (!Module._WebNetCaptureLocalCheckpoint()) throw Error(tm4Port.localCheckpointError);
      if (!Module._WebNetCapturePortableCheckpoint()) throw Error(tm4Port.portableCheckpointError);
      const snapshot = tm4Port.portableCheckpoint.slice();
      const run = () => {
        tick = start;
        // Rebind diagnostic pointers after fresh-instance restoration.
        if (!Module._WebTestApproachPickup()) throw Error("Pickup was not restored available");
        const effectIds = () => {
          Module.ccall("WebTestSnapshotObjects", null, ["string"], ["afc"]);
          return tm4Port.testSnapshotObjects;
        };
        const previousEffects = new Set(effectIds());
        const states = [];
        let heard = false,
          sparkled = false;
        for (let i = 0; i < 8; ++i) {
          step();
          if (!Module._WebNetCaptureState()) throw Error("Capture failed");
          states.push(Array.from(tm4Port.netCapturedState));
          const voices = Module.ccall(
            "WebTestCountSoundVoices",
            "number",
            ["string", "number", "number"],
            ["tm3_s05", 2000, 1],
          );
          if (voices > 1) throw Error("Duplicated pickup sound: " + voices);
          heard ||= voices === 1;
          sparkled ||= effectIds().some((id) => !previousEffects.has(id));
        }
        if (Module._WebTestPickupActive() !== 0) throw Error("Pickup remained available");
        if (
          Module._WebTestPickupAmount() !== Math.min(pickup.maximum, pickup.before + pickup.units)
        )
          throw Error("Wrong ammo award");
        if (!heard) throw Error("Missing pickup sound");
        if (!sparkled) throw Error("Missing stock pickup sparkle");
        return states;
      };
      const expected = run();
      if (!Module._WebNetRestoreLocalCheckpoint()) throw Error(tm4Port.localCheckpointError);
      const rollback = run();
      if (!Module._WebNetFinishLocalReplay()) throw Error(tm4Port.localCheckpointError);
      if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
        throw Error("Restart failed");
      Module._WebNetEndReplay();
      tm4Port.portableCheckpoint = snapshot;
      if (!Module._WebNetBeginPortableReplay()) throw Error(tm4Port.portableCheckpointError);
      Module._WebNetEndReplay();
      const portable = run();
      return { pickup, expected, rollback, portable };
    });
    assert.deepEqual(result.rollback, result.expected, map.id + " pickup rollback");
    assert.deepEqual(result.portable, result.expected, map.id + " pickup portable restore");
    assert.ok(!fixture.log.some((line) => /PAGEERROR|Aborted|RuntimeError/.test(line)));
    console.log(
      "PASS",
      map.id,
      result.pickup.name,
      "lighting, collection, stock sparkle, audio, rollback, fresh restore",
    );
  } finally {
    await fixture.close();
  }
}
