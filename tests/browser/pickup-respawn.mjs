/* global Module, tm4Port, stackSave, stackAlloc, stackRestore, HEAPU8, getWasmTableEntry */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { readMr } from "@tm4/resources/compatibility/mr";

import { prepareFixture, prepareMapFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    output: { type: "string", default: "build/checks/pickup-respawn" },
  },
});
if (!values.disc) throw Error("Supply --disc TM4_DISC_DIRECTORY; build shared with --test-hooks");
const mods = resolve(values.output, "fixture");
await prepareFixture(mods, "build/TM3.MR", "build/checks/cars");
for (const regeneration of [255, 2]) {
  const mr = await readMr(new Uint8Array(await Bun.file("build/maps/TOKYO.MR").arrayBuffer()));
  const startup = mr.directories.get("Root/objects/powerup/instances/startup");
  const pickup = startup.folders.get("tm3_12008");
  assert.ok(pickup, "Tokyo's one-use Radar pickup is required");
  new DataView(
    pickup.files.get("regenRate").bytes.buffer,
    pickup.files.get("regenRate").bytes.byteOffset,
  ).setInt32(0, regeneration, true);
  // Keep one authored pickup so the normal diagnostic approach selects it.
  startup.folders.clear();
  startup.folders.set("tm3_12008", pickup);
  const { site, archive } = prepareMapFixture(mr.root, "mt3tokyo", values.site);
  const session = await openTm3Car({
    disc: values.disc,
    site,
    mods,
    output: resolve(values.output, String(regeneration)),
    world: {
      stem: "tm3map",
      archive,
      imageArchive: new Uint8Array(await Bun.file("build/maps/TOKYO.IMG").arrayBuffer()),
    },
    cars: [{ stem: "mtm3sw", title: "TM3 Sweet Tooth", directory: "tm3sweet", file: "SWEET.MR" }],
  });
  try {
    const result = await session.page.evaluate(async (singleUse) => {
      const ensure = (value, message) => {
        if (!value) throw Error(message);
      };
      function state() {
        const saved = stackSave();
        try {
          const bytes = new TextEncoder().encode("Tm3TestPickupState\0");
          const pointer = stackAlloc(bytes.length);
          HEAPU8.set(bytes, pointer);
          const fn = Module.ccall(
            "WebDynamicModuleExport",
            "number",
            ["string", "number"],
            ["mtm3fx.sym", pointer],
          );
          ensure(fn, "Missing pickup diagnostic; build shared with --test-hooks");
          const packed = getWasmTableEntry(fn)();
          ensure(packed >= 0, "No pickup");
          return { delay: packed & 65535, active: packed >>> 16 };
        } finally {
          stackRestore(saved);
        }
      }
      let tick = 0;
      function step() {
        for (let slot = 0; slot < 2; ++slot)
          ensure(Module._WebNetSetInput(tick, slot, 0, 0, 0), "Input rejected");
        ensure(Module._WebNetQueueTick(tick++), "Tick rejected");
        ensure(!tm4Port.netMatch.unsupported, tm4Port.netMatch.unsupported);
      }
      while (tick < 10) step();
      ensure(Module._WebNetCaptureLocalCheckpoint(), "Local capture failed");
      function collect() {
        ensure(state().active === 1, "Pickup should be available before collection");
        ensure(Module._WebTestApproachPickup(), "Cannot approach pickup");
        const before = Module._WebTestPickupAmount();
        const initialDelay = state().delay;
        for (let i = 0; state().active && i < 20; ++i) step();
        ensure(state().active === 0, "Pickup not collected");
        ensure(Module._WebTestPickupAmount() > before, "Pickup granted no ammo");
        ensure(state().delay === (singleUse ? 255 : initialDelay), "Wrong respawn policy");
        Module._WebTestLeavePickup();
        return tick;
      }
      const collectedAt = collect();
      ensure(Module._WebNetCapturePortableCheckpoint(), "Portable capture failed");
      const portable = tm4Port.portableCheckpoint.slice();
      const delay = state().delay;
      const waitTicks = singleUse ? 300 : delay + 2;
      ensure(waitTicks > 0 && waitTicks < 1000, "Unexpected fixture respawn delay");
      function finish() {
        for (let i = 0; i < waitTicks; ++i) step();
        ensure(state().active === (singleUse ? 0 : 1), "Wrong pickup activity after timer");
        ensure(Module._WebNetCaptureState(), "State capture failed");
        return Array.from(tm4Port.netCapturedState);
      }
      const expected = finish();
      ensure(Module._WebNetRestoreLocalCheckpoint(), tm4Port.localCheckpointError);
      tick = 10;
      ensure(collect() === collectedAt, "Collection tick changed after rollback");
      const local = finish();
      ensure(Module._WebNetFinishLocalReplay(), "Local replay failed");
      ensure(
        await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true }),
        "Restart failed",
      );
      Module._WebNetEndReplay();
      tm4Port.portableCheckpoint = portable;
      ensure(Module._WebNetBeginPortableReplay(), tm4Port.portableCheckpointError);
      Module._WebNetEndReplay();
      tick = collectedAt;
      ensure(
        state().delay === delay && state().active === 0,
        "Collected pickup state not restored",
      );
      const restored = finish();
      return { expected, local, restored, collectedAt, delay };
    }, regeneration === 255);
    assert.deepEqual(result.local, result.expected);
    assert.deepEqual(result.restored, result.expected);
    console.log(
      "PASS",
      regeneration === 255 ? "one-use pickup stays hidden" : "ordinary pickup respawns",
      "local + portable restore",
    );
  } finally {
    await session.close();
  }
}
