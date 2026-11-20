/* global Module, HEAPU8, HEAPU32, stackSave, stackAlloc, stackRestore, getWasmTableEntry */
import assert from "node:assert/strict";

// Inspect packets from the engine renderer, without browser colour conversion.
export async function checkPickupLighting(page) {
  const result = await page.evaluate(() => {
    const saved = stackSave();
    const changed = [];
    try {
      const string = (text) => {
        const bytes = new TextEncoder().encode(text + "\0"),
          ptr = stackAlloc(bytes.length);
        HEAPU8.set(bytes, ptr);
        return ptr;
      };
      const slot = Module.ccall(
        "WebDynamicModuleExport",
        "number",
        ["string", "number"],
        ["o_power.sym", string("PowerupScreenDisplay")],
      );
      if (!slot) throw Error("Missing native pickup renderer");
      const render = getWasmTableEntry(slot);
      const model = Module.ccall(
        "RegGetFileDataS",
        "number",
        ["string"],
        ["/objects/powerup/power.bin"],
      );
      if (!model) throw Error("Missing native pickup model");
      const faces = HEAPU32[(model + 0xa0) >>> 2];
      const faceCount = HEAPU32[(model + 0x98) >>> 2];
      // Keep face order stable across rotations; restore culling flags before gameplay.
      for (let i = 0; i < faceCount; ++i) {
        const address = faces + i * 20 + 15;
        changed.push([address, HEAPU8[address]]);
        HEAPU8[address] = 1;
      }
      const ordering = stackAlloc(8),
        cursor = stackAlloc(4),
        packets = stackAlloc(16384);
      const fire = string("fire");
      const colors = (angle) => {
        HEAPU32[ordering >>> 2] = 0xffffff;
        HEAPU32[cursor >>> 2] = packets;
        render(fire, angle, 160, 120, 1024, ordering, cursor, packets + 16384);
        const end = HEAPU32[cursor >>> 2],
          result = [];
        for (let p = packets; p < end;) {
          const code = HEAPU8[p + 11];
          if (code !== 0x30 && code !== 0x38) throw Error("Unexpected Gouraud packet");
          const corners = code === 0x38 ? 4 : 3;
          for (let i = 0; i < corners; ++i)
            result.push(...HEAPU8.slice(p + 8 + i * 8, p + 11 + i * 8));
          p += 8 + corners * 8;
        }
        return result;
      };
      return [colors(0), colors(1024), colors(2048)];
    } finally {
      for (const [address, value] of changed) HEAPU8[address] = value;
      stackRestore(saved);
    }
  });
  assert.ok(result[0].length > 0, "pickup renderer must emit polygons");
  assert.equal(result[0].length, result[1].length);
  assert.equal(result[0].length, result[2].length);
  assert.ok(
    result[0].some((v) => v > 0),
    "pickup must not be black",
  );
  assert.ok(
    result[0].some((v, i) => v !== result[1][i] || v !== result[2][i]),
    "pickup vertex colours must respond to rotation under TM4 lighting",
  );
}
