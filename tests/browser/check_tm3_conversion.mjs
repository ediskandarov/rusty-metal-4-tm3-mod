/* global Module, tm4Port, stackSave, stackAlloc, stackRestore, HEAPU8, getWasmTableEntry */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { openDataDisc } from "@rusty-metal-4/disc";
import { convertCar, readCar } from "@rusty-metal-4/tm3-resources";
import { binary, writeMr } from "@tm4/resources/mods/mr-writer";

import { createModuleBuilder } from "../../apps/wasm.ts";
import { prepareFixture } from "./fixture.mjs";
import { openTm3Car } from "./helpers/tm3.mjs";

const { values } = parseArgs({
  strict: true,
  options: {
    disc: { type: "string" },
    "tm3-disc": { type: "string" },
    site: { type: "string", default: "external/rusty-metal-4/build/diagnostic/site" },
    mods: { type: "string", default: "build/checks/fixture" },
    output: { type: "string", default: "build/checks/tm3-conversion" },
  },
});
if (!values.disc || !values["tm3-disc"])
  throw Error(
    "Usage: bun tests/browser/check_tm3_conversion.mjs --disc TM4_DISC --tm3-disc TM3_DISC",
  );
await prepareFixture(resolve(values.mods), "build/TM3.MR", "build/checks/cars");
const site = resolve(values.site),
  mods = resolve(values.mods),
  output = resolve(values.output);
const gameBuild = resolve(site, "..");
const directory = join(mods, "tm3conversion");
await mkdir(directory, { recursive: true });
await mkdir(output, { recursive: true });
const compile = await createModuleBuilder(gameBuild);
await compile({
  name: "mtm3cv",
  sources: [resolve("tests/native/conversion.c")],
  output: directory,
});

function geometry(source, result) {
  const resolution = result.root.folders.get("display").folders.get("resolution");
  const faces = resolution.files.get("FaceList").bytes;
  const vertices = resolution.files.get("VertexList").bytes;
  const points = new DataView(vertices.buffer, vertices.byteOffset, vertices.byteLength);
  let checked = 0;
  for (const [lod, model] of source.models.entries()) {
    const entries = resolution.folders.get(`r${lod}`).folders.get("Groups").files;
    for (const [gi, group] of model.groups.entries()) {
      const converted = result.metadata.groups[lod].filter((g) => g.source_group === gi);
      for (let frame = 0; frame < 2; ++frame) {
        const [first, count, start] = group.frames[frame];
        let index = first;
        for (const part of converted) {
          const raw = entries.get(part.name).bytes;
          const data = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
          const firstFace = data.getInt16(frame * 12, true),
            faceCount = data.getInt16(frame * 12 + 2, true);
          const firstVertex = data.getInt16(frame * 12 + 4, true);
          for (let i = 0; i < faceCount; ++i) {
            const original = model.faces[index++],
              offset = (firstFace + i) * 24;
            assert.equal(faces[offset], original.command & 127);
            assert.equal(faces[offset + 1], original.command & 128 ? 1 : 0);
            const degree = (original.command & 127) === 0x24 ? 3 : 4;
            for (let v = 0; v < degree; ++v) {
              const actual = [0, 1, 2].map((axis) =>
                points.getInt16((firstVertex + faces[offset + 16 + v]) * 8 + axis * 2, true),
              );
              const expected = model.vertices[start + original.indices[v]]
                .slice(0, 3)
                .map(
                  (value, axis) =>
                    value + (group.flag && group.transform_slot >= 4 ? group.center[axis] : 0),
                );
              assert.deepEqual(actual, expected, `${lod}/${gi}/${frame}/${index - 1}`);
              ++checked;
            }
          }
        }
        assert.equal(index, first + count, "Every referenced source polygon must remain");
      }
    }
  }
  return checked;
}
function expectedWheels(source) {
  const result = Array.from({ length: 4 }, () => ({ radius: 0, width: 0, present: 0 }));
  for (const group of source.models[0].groups) {
    const slot = [0, 1, 3, 2][group.transform_slot];
    if (slot === undefined || result[slot].present) continue;
    const [, , first, count] = group.frames[0],
      points = source.models[0].vertices.slice(first, first + count);
    result[slot] = {
      present: 1,
      radius: Math.trunc(
        (Math.max(...points.map((p) => p[2])) - Math.min(...points.map((p) => p[2]))) / 2,
      ),
      width: Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0])),
    };
  }
  const r = result.map((w) => w.radius);
  if (!r[0]) r[0] = r[1];
  if (!r[1]) r[1] = r[0];
  if (!r[3]) r[3] = r[2];
  if (!r[2]) r[2] = r[3];
  if (!r[0]) r[0] = r[1] = r[3] || r[2];
  if (!r[3]) r[3] = r[2] = r[0] || r[1];
  if (!r[0]) r.fill(22);
  result.forEach((w, i) => {
    w.radius = r[i];
  });
  return result;
}
const disc = await openDataDisc(values["tm3-disc"]);
const results = [];
for (const name of [
  "FIRE",
  "AXEL",
  "GRIMM",
  "AUGER",
  "CLUBKID",
  "DARKSIDE",
  "FPOWER",
  "HAMMER",
  "MINION",
  "OUTLAW",
  "PRIMEVAL",
  "RDKILL",
  "SPECTRE",
  "SWEET",
  "THUMPER",
  "WARTHOG",
]) {
  const bytes = await disc(`/CARS/${name}.CAR`),
    original = bytes.slice();
  const source = readCar(bytes),
    result = await convertCar(bytes);
  assert.deepEqual(bytes, original, "Conversion must not alter source bytes");
  assert.deepEqual(result.metadata.validation.errors, []);
  assert.deepEqual(result.metadata.validation.warnings, []);
  const corners = geometry(source, result),
    wheels = expectedWheels(source);
  // Test resource conversion without borrowing a stock car's special behavior.
  const symbol = new TextEncoder().encode("mtm3cv.sym*\0"),
    behavior = new Uint8Array(32);
  new DataView(behavior.buffer).setUint32(16, 20, true);
  behavior.set(symbol, 20);
  result.root.files.set("behavior.mod", { ...binary(behavior), type: 6 });
  await Bun.write(join(directory, `${name}.MR`), writeMr(result.root));
  const fixture = await openTm3Car({
    disc: values.disc,
    site,
    mods,
    output: join(output, name),
    cars: [
      { stem: "mtm3cv", title: `TM3 ${name}`, directory: "tm3conversion", file: `${name}.MR` },
    ],
  });
  try {
    const runtime = await fixture.page.evaluate(
      async ({ name }) => {
        function call(name, ...args) {
          const lib = globalThis.LDSO.loadedLibsByName["/modules/mtm3cv.wasm"];
          const saved = stackSave(),
            raw = new TextEncoder().encode(name + "\0"),
            p = stackAlloc(raw.length);
          HEAPU8.set(raw, p);
          try {
            const i = lib.exports.Tm4ModuleExport(p);
            if (!i) throw Error("Missing diagnostic " + name);
            return getWasmTableEntry(i)(...args);
          } finally {
            stackRestore(saved);
          }
        }
        let tick = 0;
        async function steps(count, buttons = 0) {
          for (let i = 0; i < count; ++i) {
            if (
              !Module._WebNetSetInput(tick, 0, buttons, 0, 0) ||
              !Module._WebNetSetInput(tick, 1, 0, 0, 0) ||
              !Module._WebNetQueueTick(tick++)
            )
              throw Error("Cannot queue conversion test tick");
            await new Promise((r) => setTimeout(r, 25));
            if (tm4Port.netMatch.unsupported) throw Error(tm4Port.netMatch.unsupported);
          }
        }
        const sample = () =>
          Array.from({ length: 23 }, (_, field) =>
            call("inspect", Module._WebTestReplayCarAddress(), field),
          );
        await steps(3);
        const before = sample();
        if (before[14] !== 3) throw Error("LOD count changed");
        for (let lod = 0; lod < 3; ++lod)
          for (let frame = 0; frame < 2; ++frame) {
            call("display", Module._WebTestReplayCarAddress(), lod, frame);
            await steps(1);
            if (sample()[12] !== frame) throw Error("Wrong damage frame");
            if (["FIRE", "AXEL", "GRIMM"].includes(name))
              await globalThis.capturePhase(`lod-${lod}-frame-${frame}`);
          }
        call("display", Module._WebTestReplayCarAddress(), -1, 0);
        await steps(20, 64);
        const moving = sample();
        call("display", Module._WebTestReplayCarAddress(), 1, 0);
        if (!call("freeze", Module._WebTestReplayCarAddress()) || !sample()[21])
          throw Error("Freeze face copy failed");
        await steps(1);
        const frozen = sample();
        if (!frozen[19] || !frozen[21]) throw Error("Frozen rendering was not exercised");
        if (["FIRE", "AXEL", "GRIMM"].includes(name)) await globalThis.capturePhase("frozen");
        await steps(12);
        const thawed = sample();
        if (thawed[19] || thawed[21]) throw Error("Freeze did not release copied faces");
        call("display", Module._WebTestReplayCarAddress(), -1, 0);
        return { before, moving, frozen, thawed, tick };
      },
      { name },
    );
    assert.deepEqual(
      runtime.before.slice(0, 4),
      wheels.map((w) => w.radius),
      "Native wheel radius/fallback differs",
    );
    assert.deepEqual(
      runtime.before.slice(4, 8),
      wheels.map((w) => w.width),
      "Native wheel width differs",
    );
    assert.deepEqual(
      runtime.before.slice(8, 12),
      wheels.map((w) => w.present),
      "Wheel associations changed",
    );
    assert.equal(runtime.before[20], result.metadata.validation.undrawnFaces);
    assert(runtime.before.slice(0, 4).every((r) => r > 0));
    assert(runtime.moving[22] > 0, "Throttle did not reach the car controls");
    assert.notDeepEqual(
      runtime.before.slice(16, 19),
      runtime.moving.slice(16, 19),
      "Car did not move",
    );
    assert(
      !fixture.log.some((s) => s.startsWith("PAGEERROR") || s.includes("Aborted(")),
      "Browser failed",
    );
    results.push({ name, corners, wheels, undrawn: result.metadata.undrawn_faces, runtime });
    await Bun.write(join(output, "result.json"), JSON.stringify(results, null, 2));
    console.log("PASS CONVERSION", name, corners, JSON.stringify(wheels));
  } finally {
    await fixture.close();
  }
}
console.log(
  "All 16 CARs preserve referenced geometry and load through native TM4 car construction",
);
