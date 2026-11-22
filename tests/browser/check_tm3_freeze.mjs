/* global Module, tm4Port, getWasmTableEntry */
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { readMr } from "@tm4/resources/compatibility/mr";
import { writeMr } from "@tm4/resources/mods/mr-writer";

import { prepareFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  options: {
    disc: { type: "string" },
    effects: { type: "string", default: "both" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    mods: { type: "string", default: "build/checks/fixture" },
    output: { type: "string", default: "build/checks/tm3-freeze" },
  },
});
if (!values.disc) throw Error("Pass --disc TM4_DISC_DIRECTORY");
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const profiles = {
  both: [true, true],
  freeze: [true, false],
  invisibility: [false, true],
  stock: [false, false],
}[values.effects];
if (!profiles) throw Error("--effects must be both, freeze, invisibility or stock");
const archive = resolve(values.mods, "tm3outlaw/OUTLAW.MR");
const root = (await readMr(new Uint8Array(await Bun.file(archive).arrayBuffer()))).root;
if (!profiles[0]) root.folders.delete("freezeEffect");
if (!profiles[1]) root.folders.delete("invisibilityEffect");
await Bun.write(archive, writeMr(root));
const fixture = await openTm3Car({
  ...values,
  site: resolve(values.site),
  mods: resolve(values.mods),
  output: resolve(values.output),
  cars: [{ stem: "mtm3ol", title: "TM3 Outlaw", directory: "tm3outlaw", file: "OUTLAW.MR" }],
});
try {
  await fixture.page.evaluate(async ([customFreeze, customInvisibility]) => {
    let tick = 0;
    async function step(buttons = 0, otherButtons = 0) {
      if (
        !Module._WebNetSetInput(tick, 0, buttons, 0, 0) ||
        !Module._WebNetSetInput(tick, 1, otherButtons, 0, 0) ||
        !Module._WebNetQueueTick(tick++)
      )
        throw Error("Could not queue inputs");
      const deadline = performance.now() + 5000;
      while (tm4Port.netMatch.tick < tick) {
        if (performance.now() > deadline) throw Error("Timed out advancing tick " + tick);
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    const query = (slot, field) => {
      const fn = Module.ccall(
        "WebDynamicModuleExport",
        "number",
        ["string", "string"],
        ["mtm3fx.sym", "Tm3TestCarEffectState"],
      );
      if (!fn) throw Error("Missing effect state reader");
      return getWasmTableEntry(fn)(slot, field);
    };
    async function renderFrame(name) {
      const previous = tm4Port.levelFrames;
      const deadline = performance.now() + 5000;
      while (tm4Port.levelFrames === previous) {
        if (performance.now() > deadline) throw Error("No rendered frame for " + name);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    const read = () => {
      Module._WebTestReadEnergyActions();
      tm4Port.energyAction.target = {
        freeze: query(1, 0),
        invisible: query(1, 1),
        copiedFaces: query(1, 2),
      };
      const expected = Number(customFreeze) | (Number(customInvisibility) << 1);
      if (query(0, 6) !== expected || query(1, 6) !== expected)
        throw Error("Profiles were not rebound to the selected resources");
      if ((customFreeze && query(1, 4)) || (customInvisibility && query(0, 5)))
        throw Error("A silent profile acquired a stock loop");
      return tm4Port.energyAction;
    };
    for (let i = 0; i < 100; ++i) await step();
    const cloak = [0x4000, 0, 0x4000, 0, 0x1000, 0, 0x1000];
    for (const buttons of cloak) await step(0, buttons);
    if (!Module._WebTestPlaceEnergyTarget(0) || read().target.invisible !== 180)
      throw Error("Expected a cloaked opponent");
    const energy = read().energy;
    for (const button of [0x8000, 0, 0x2000, 0, 0x1000, 0, 0x1000]) await step(button);
    for (let i = 0; i < 50 && !read().target.freeze; ++i) await step();
    const hit = read();
    if (
      !hit.target.invisible ||
      hit.energy >= energy ||
      hit.target.freeze < 119 ||
      hit.target.freeze > 120 ||
      !!hit.target.copiedFaces !== (!customFreeze || !customInvisibility)
    )
      throw Error("Freeze combo or material failed: " + JSON.stringify(hit));
    await renderFrame("frozen-opponent");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error("Could not save frozen Outlaw: " + tm4Port.portableCheckpointError);
    const checkpoint = tm4Port.portableCheckpoint.slice(),
      savedTick = tick;
    async function thaw() {
      for (let n = hit.target.freeze; n > 0; --n) {
        await step();
        if (read().target.freeze !== n - 1) throw Error("Freeze countdown diverged at " + n);
      }
      if (!Module._WebNetCaptureState()) throw Error("Could not capture thawed state");
      return JSON.stringify(Array.from(tm4Port.netCapturedState));
    }
    const reference = await thaw();
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error("Could not restore local checkpoint");
    tick = savedTick;
    if ((await thaw()) !== reference || !Module._WebNetFinishLocalReplay())
      throw Error("Rollback differed");
    if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
      throw Error("Restart failed");
    Module._WebNetEndReplay();
    tm4Port.portableCheckpoint = checkpoint;
    if (!Module._WebNetBeginPortableReplay()) throw Error("Could not restore frozen Outlaw");
    Module._WebNetEndReplay();
    tick = savedTick;
    if ((await thaw()) !== reference) throw Error("Portable replay differed");
    if (!Module._WebTestPlaceEnergyTarget(1)) throw Error("Could not position rear target");
    for (const button of [0x8000, 0, 0x2000, 0, 0x4000, 0, 0x4000]) await step(button);
    for (let i = 0; i < 50 && !read().target.freeze; ++i) await step();
    if (read().target.freeze < 119 || read().target.freeze > 120)
      throw Error("Rear freeze missed Outlaw");
    while (read().energy < 3900) await step();
    for (const buttons of cloak) await step(buttons);
    const invisible = read();
    if (
      invisible.invisible !== 180 ||
      (customInvisibility && !invisible.hidden) ||
      !!invisible.copiedFaces !== !customInvisibility ||
      !!invisible.copiedColors !== !customInvisibility
    )
      throw Error(
        "Unexpected cloak material for the selected profile: " + JSON.stringify(invisible),
      );
    await renderFrame("own-cloak");
    // Stock shield and TM3 invisibility have independent timers and material lifetimes.
    for (const buttons of [0, 0x1000, 0, 0x1000, 0, 0x2000]) await step(buttons);
    if (read().shield !== 180 || !read().copiedFaces || (customInvisibility && !read().hidden))
      throw Error("Shield did not activate during cloak");
    await renderFrame("cloak-shield");
    for (let n = read().invisible; n > 0; --n) {
      await step();
      const state = read();
      if (state.invisible !== n - 1 || (customInvisibility && state.hidden !== n > 1))
        throw Error("Incorrect cloak lifetime at " + n);
    }
    if (!read().shield || !read().copiedFaces) throw Error("Cloak expiry discarded the shield");
    while (read().shield) await step();
    if (read().copiedFaces || read().copiedColors || (customInvisibility && read().hidden))
      throw Error("Outlaw did not return to its normal material");
  }, profiles);
  console.log(`PASS ${values.effects}: cloak, shield, freeze, rollback and portable restore`);
} finally {
  await fixture.close();
}
