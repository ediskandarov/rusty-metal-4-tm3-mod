/* global Module, tm4Port, stackSave, stackAlloc, stackRestore, HEAPU32 */
import assert from "node:assert/strict";

export async function checkScreenFlash(page) {
  const result = await page.evaluate(async () => {
    let tick = tm4Port.netMatch.tick;
    const step = () => {
      for (let slot = 0; slot < 2; slot++)
        if (!Module._WebNetSetInput(tick, slot, 0, 0, 0)) throw Error("Input rejected");
      if (!Module._WebNetQueueTick(tick++) || tm4Port.netMatch.tick !== tick)
        throw Error("Tick did not advance");
      if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
    };
    const count = () => {
      Module.ccall("WebTestSnapshotObjects", null, ["string"], ["tm3ScreenFlash"]);
      return tm4Port.testSnapshotObjects.length;
    };
    const simulate = (action) => {
      Module.ccall("WebCheckpointArenaSelect", null, ["number"], [1]);
      try {
        return action();
      } finally {
        Module.ccall("WebCheckpointArenaSelect", null, ["number"], [0]);
      }
    };
    const beam = () =>
      simulate(() => {
        const mark = stackSave();
        try {
          // ObjectCreate's variadic arguments are two SVECTOR pointers.
          const vector = stackAlloc(8),
            args = stackAlloc(8);
          HEAPU32[vector >>> 2] = HEAPU32[(vector + 4) >>> 2] = 0;
          HEAPU32[args >>> 2] = HEAPU32[(args + 4) >>> 2] = vector;
          const object = Module.ccall(
            "ObjectCreate",
            "number",
            ["string", "number", "number"],
            ["tm3MapBeam", 0, args],
          );
          if (!object) throw Error("Cannot create beam");
          return object;
        } finally {
          stackRestore(mark);
        }
      });
    // Capture a live flash after its beam has gone away.
    const first = beam();
    simulate(() => Module._ObjectDestroy(first));
    step();
    step();
    if (count() !== 1 || Module._WebTestWorldFlash() < 0) throw Error("Missing independent flash");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(tm4Port.localCheckpointError || tm4Port.portableCheckpointError);
    const snapshot = tm4Port.portableCheckpoint.slice(),
      start = tick;
    const run = () => {
      tick = start;
      const restored = Module._WebTestWorldFlash();
      if (count() !== 1 || restored < 0) throw Error("Active flash was not restored");
      const older = beam(),
        newer = beam();
      if (count() !== 1) throw Error("Overlapping beams created multiple flashes");
      const initial = Module._WebTestWorldFlash();
      simulate(() => {
        Module._ObjectDestroy(older);
        Module._ObjectDestroy(newer);
      });
      if (Module._WebTestWorldFlash() !== initial) throw Error("Beam destruction cleared flash");
      const colors = [restored, initial],
        states = [];
      for (let i = 0; i < 26; i++) {
        step();
        const color = Module._WebTestWorldFlash();
        // Creation happened between ticks, before this tick's simulation began.
        if (i === 0 && color !== initial) throw Error("Flash advanced on its creation tick");
        if (i > 0 && color >= 0) {
          for (const shift of [0, 8, 16])
            if (((color >>> shift) & 255) !== Math.max(0, ((colors.at(-1) >>> shift) & 255) - 12))
              throw Error("Overlapping beams changed the fade rate");
        }
        colors.push(color);
        if (!Module._WebNetCaptureState()) throw Error("Cannot capture state");
        states.push(Array.from(tm4Port.netCapturedState));
      }
      if (count() || colors.at(-1) !== -1) throw Error("Flash did not expire");
      return { colors, states };
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
    return { expected, rollback, portable: run() };
  });
  assert.deepEqual(result.rollback, result.expected, "overlapping flash rollback");
  assert.deepEqual(result.portable, result.expected, "overlapping flash portable restore");
}
