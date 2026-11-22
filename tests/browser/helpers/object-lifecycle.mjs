/* global Module, tm4Port, HEAP16 */
import assert from "node:assert/strict";

export async function checkObjectLifecycle(page, { module, car, props }) {
  const result = await page.evaluate(
    async ({ module, car, props }) => {
      const registry = () => {
        Module.ccall("WebTestObjectRegistry", null, ["string"], [module ? module + ".sym" : ""]);
        return tm4Port.testObjectRegistry;
      };
      const stop = async () => {
        await Module.ccall("WebNetCancelMatch", null, [], [], { async: true });
        const empty = registry();
        if (
          empty.classes.length ||
          empty.pairs.length ||
          empty.objects ||
          empty.bindings ||
          empty.tables ||
          empty.moduleLoaded
        )
          throw Error("Object registry survived teardown: " + JSON.stringify(empty));
      };
      const start = async (world) => {
        const started = await Module.ccall(
          "WebNetStartFfa",
          "number",
          [
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "string",
            "string",
            "number",
            "string",
            "number",
            "number",
            "number",
          ],
          [
            8,
            3,
            world,
            12345,
            0,
            3,
            car + "\n" + car,
            "0000000000000001\n0000000000000002",
            90,
            car,
            27000,
            20,
            0,
          ],
          { async: true },
        );
        if (!started) throw Error("Map reload failed");
        if (Module._WebTestWeaponTargetHealth() !== -1)
          throw Error("Weapon test target survived map restart");
        if (!world) {
          const points = Module.ccall(
            "RegGetFileDataS",
            "number",
            ["string"],
            ["/world/startpoints"],
          );
          const count = Module.ccall(
            "RegGetFileArraySizeS",
            "number",
            ["string"],
            ["/world/startpoints"],
          );
          for (let i = 0; i < count; ++i) {
            const point = points + i * 16;
            const x = HEAP16[point >>> 1],
              y = HEAP16[(point + 2) >>> 1],
              z = HEAP16[(point + 4) >>> 1];
            if (y !== Module._WorldGetHeight(x, z) - 96)
              throw Error(`Baked spawn ${i} differs from engine ground query`);
          }
        }

        Module.ccall("WebTestSnapshotObjects", null, ["string"], ["tm3Prop"]);
        if (!world && tm4Port.testSnapshotObjects.length !== props)
          throw Error("Startup instances changed on reload");
        const state = registry();
        if (module && state.moduleLoaded !== !world) throw Error("Map module ownership leaked");
        if (world && state.classes.includes("tm3Eye"))
          throw Error("Egypt class leaked onto stock map");
        // Exercise registered interactions and snapshot traversal after every load.
        for (let tick = 0; tick < 20; ++tick) {
          for (let slot = 0; slot < 2; ++slot)
            if (!Module._WebNetSetInput(tick, slot, tick === 10 ? 1 : 0, 0, 0))
              throw Error("Input rejected");
          if (!Module._WebNetQueueTick(tick)) throw Error("Tick rejected");
        }
        const targetHealth = Module._WebTestPlaceWeaponTarget(400);
        if (targetHealth <= 0) throw Error("Cannot select weapon test target");
        if (!Module._WebNetCaptureLocalCheckpoint() || !Module._WebNetCapturePortableCheckpoint())
          throw Error(tm4Port.localCheckpointError || tm4Port.portableCheckpointError);
        if (!Module._WebNetRestoreLocalCheckpoint()) throw Error(tm4Port.localCheckpointError);
        if (Module._WebTestWeaponTargetHealth() !== targetHealth)
          throw Error("Weapon test target lost after local restore");
        if (!Module._WebNetFinishLocalReplay()) throw Error(tm4Port.localCheckpointError);
        return state;
      };
      await stop();
      const first = await start(0);
      await stop();
      await start(0); // Same map and seed repeat object serials.
      await stop();
      await start(1);
      await stop();
      const second = await start(0);
      await stop();
      return { first, second };
    },
    { module, car, props },
  );
  assert.deepEqual(
    result.second,
    result.first,
    "Reload must recreate the same classes, interactions and startup objects",
  );
}
