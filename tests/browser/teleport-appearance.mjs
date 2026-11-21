/* global Module, tm4Port, getWasmTableEntry */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { readMr } from "@tm4/resources/compatibility/mr";
import { stringEntry } from "@tm4/resources/mods/mr-writer";

import { prepareFixture, prepareMapFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    output: { type: "string", default: "build/checks/teleport-appearance" },
  },
});
if (!values.disc) throw Error("Supply --disc TM4_DISC_DIRECTORY");
const mods = resolve(values.output, "fixture");
await prepareFixture(mods, "build/TM3.MR", "build/checks/cars");
const root = (await readMr(new Uint8Array(await Bun.file("build/maps/WASH.MR").arrayBuffer())))
  .root;
const portals = root.folders
  .get("objects")
  .folders.get("teleporter")
  .folders.get("instances")
  .folders.get("startup");
assert.ok(portals.folders.size > 0, "Washington must have portals");
for (const instance of portals.folders.values())
  instance.files.set("appearance", stringEntry("tm3TestPortalVisual"));
const { site, archive } = prepareMapFixture(
  root,
  undefined,
  "external/rusty-metal-4/build/diagnostic/site",
);
const fixture = await openTm3Car({
  disc: values.disc,
  site,
  mods,
  output: values.output,
  world: {
    stem: "tm3map",
    archive,
    imageArchive: new Uint8Array(await Bun.file("build/maps/WASH.IMG").arrayBuffer()),
  },
  cars: [{ stem: "mtm3sw", title: "TM3 Sweet Tooth", directory: "tm3sweet", file: "SWEET.MR" }],
});
try {
  const result = await fixture.page.evaluate(async (expectedPortals) => {
    const check = (ok, why) => {
      if (!ok) throw Error(why);
    };
    const probe = (action) => {
      const slot = Module.ccall(
        "WebDynamicModuleExport",
        "number",
        ["string", "string"],
        ["mtm3fx.sym", "Tm3TestPortal"],
      );
      check(slot, "Missing appearance probe");
      Module._WebCheckpointArenaSelect(1);
      try {
        return getWasmTableEntry(slot)(action);
      } finally {
        Module._WebCheckpointArenaSelect(0);
      }
    };
    const step = (tick) => {
      for (let slot = 0; slot < 2; ++slot)
        check(Module._WebNetSetInput(tick, slot, 0, 0, 0), "Input rejected");
      check(Module._WebNetQueueTick(tick), "Tick rejected");
      check(!tm4Port.netMatch.unsupported, tm4Port.netMatch.unsupported);
    };
    for (let tick = 0; tick < 10; ++tick) step(tick);
    check(probe(0) === expectedPortals, "Portal appearances missing or invalid");
    const constructed = probe(1);
    check(constructed === expectedPortals, "Appearance created more than once");
    check(Module._WebNetCaptureLocalCheckpoint(), tm4Port.localCheckpointError);
    check(Module._WebNetCapturePortableCheckpoint(), tm4Port.portableCheckpointError);
    const present = tm4Port.portableCheckpoint.slice();
    const run = () => {
      check(probe(0) === expectedPortals, "Restore lost appearances or owners");
      const destroyed = probe(2);
      check(probe(4) === 1, "Portal deletion failed");
      check(probe(2) === destroyed + 1, "Owned appearance destructor was not called");
      check(probe(0) === expectedPortals - 1, "Deleted portal left an orphan appearance");
      const states = [];
      for (let tick = 10; tick < 15; ++tick) {
        step(tick);
        check(Module._WebNetCaptureState(), "Capture failed");
        states.push(Array.from(tm4Port.netCapturedState));
      }
      return states;
    };
    const expected = run();
    check(Module._WebNetRestoreLocalCheckpoint(), tm4Port.localCheckpointError);
    check(probe(1) === constructed, "Rollback reran visual constructors");
    const rollback = run();
    check(Module._WebNetFinishLocalReplay(), tm4Port.localCheckpointError);
    check(
      await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true }),
      "Restart failed",
    );
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = present;
    check(Module._WebNetBeginPortableReplay(), tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    const portable = run();
    check(Module._WebNetCapturePortableCheckpoint(), tm4Port.portableCheckpointError);
    const absent = tm4Port.portableCheckpoint.slice();
    check(
      await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true }),
      "Restart failed",
    );
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = absent;
    check(Module._WebNetBeginPortableReplay(), tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    check(
      probe(0) === expectedPortals - 1,
      "Portable restore resurrected deleted portal/appearance",
    );
    return { expected, rollback, portable };
  }, portals.folders.size);
  assert.deepEqual(result.rollback, result.expected, "appearance rollback");
  assert.deepEqual(result.portable, result.expected, "appearance portable restore");
  assert.ok(!fixture.log.some((line) => /PAGEERROR|Aborted|RuntimeError/.test(line)));
  console.log("PASS custom appearance creation, owner deletion, rollback and portable restore");
} finally {
  await fixture.close();
}
