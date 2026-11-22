/* global Module, tm4Port, getWasmTableEntry */
import assert from "node:assert/strict";

export async function checkFragmentEffects(page) {
  const result = await page.evaluate(async () => {
    const restart = async () => {
      if (!(await Module.ccall("WebTestRestartNetworkReplay", "number", [], [], { async: true })))
        throw Error("Fragment fixture restart failed");
      Module._WebNetEndReplay();
    };
    const counts = (reset = 0) => {
      const address = Module.ccall(
        "WebDynamicModuleExport",
        "number",
        ["string", "string"],
        ["mtm3fx.sym", "Tm3TestFragmentEffects"],
      );
      if (!address) throw Error("Missing fragment diagnostic");
      return getWasmTableEntry(address)(reset);
    };
    const count = (name) => {
      Module.ccall("WebTestSnapshotObjects", null, ["string"], [name]);
      return tm4Port.testSnapshotObjects.length;
    };
    await restart();
    if (Module._WebTestDropFragments() !== 8 || count("fragment") !== 8)
      throw Error("Could not create stock fragments");
    if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
      throw Error(tm4Port.localCheckpointError || tm4Port.portableCheckpointError);
    const snapshot = tm4Port.portableCheckpoint.slice();
    const run = () => {
      counts(1);
      const states = [];
      let seenSprites = false;
      for (let tick = 0; tick < 120; ++tick) {
        for (let slot = 0; slot < 2; ++slot)
          if (!Module._WebNetSetInput(tick, slot, 0, 0, 0)) throw Error("Input rejected");
        if (!Module._WebNetQueueTick(tick)) throw Error("Tick rejected");
        if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
        seenSprites ||= count("tm3Sprite") > 0;
        if (!Module._WebNetCaptureState()) throw Error("Cannot capture fragment state");
        states.push(Array.from(tm4Port.netCapturedState));
      }
      const observed = counts();
      if (observed !== 8)
        throw Error("Expected eight impacts without gameplay RNG changes: " + observed);
      if (count("fragment") || !seenSprites)
        throw Error("Impact failed to replace fragments with effects");
      return states;
    };
    tm4Port.testMixerStarts = [];
    const forward = run();
    const heard = tm4Port.testMixerStarts.length;
    if (!heard) throw Error("Fixture did not exercise sound playback");
    if (!Module._WebNetRestoreLocalCheckpoint()) throw Error(tm4Port.localCheckpointError);
    const replay = run();
    if (!Module._WebNetFinishLocalReplay()) throw Error("Replay finish failed");
    if (tm4Port.testMixerStarts.length !== heard)
      throw Error("Replay restarted previously heard sounds");
    await restart();
    counts(1);
    tm4Port.portableCheckpoint = snapshot;
    if (!Module._WebNetBeginPortableReplay()) throw Error(tm4Port.portableCheckpointError);
    Module._WebNetEndReplay();
    if (counts() !== 0) throw Error("Snapshot restore invoked fragment presentation");
    const portable = run();
    return { forward, replay, portable, heard };
  });
  assert.deepEqual(result.replay, result.forward, "Fragment impact rollback");
  assert.deepEqual(result.portable, result.forward, "Fragment impact portable restore");
}
