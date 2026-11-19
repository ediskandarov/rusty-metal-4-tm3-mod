import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  convertCar,
  enableCarAnimations,
  parameterFields,
  readCar,
  readModel,
  readParameters,
  TextureRectangle,
} from "@rusty-metal-4/tm3-resources";
import { readMr } from "@tm4/resources/compatibility/mr";
import { writeMr } from "@tm4/resources/mods/mr-writer";

function meshFixture(
  points = [
    [0, 0, 0],
    [32, 0, 0],
    [0, -32, 32],
  ],
) {
  const groups = 2,
    faces = 2,
    vertices = points.length;
  const faceStart = 44 + groups * 24,
    vertexStart = faceStart + faces * 20;
  const order = vertexStart + vertices * 8 + 4;
  const bytes = new Uint8Array(order + 16 * (groups + 1) + 4),
    view = new DataView(bytes.buffer);
  [8, order, groups, faces, vertices].forEach((v, i) => view.setUint32(i * 4, v, true));
  for (let i = 0; i < groups; ++i) {
    [0, 1, 0, vertices, 0, 1, 0, vertices].forEach((v, j) =>
      view.setInt16(44 + i * 24 + j * 2, v, true),
    );
    view.setInt8(44 + i * 24 + 23, -1);
  }
  bytes[faceStart + 3] = 0x24;
  bytes.set([0, 1, 2, 255], faceStart + 16);
  bytes.fill(0xcd, faceStart + 20, faceStart + 40);
  points.forEach((p, i) =>
    p.forEach((v, j) => view.setInt16(vertexStart + i * 8 + j * 2, v, true)),
  );
  for (let i = 0; i < 16; ++i) bytes.set([1, i % 2, 0xcd], order + i * 3);
  return { bytes, view, faceStart, order };
}
function carFixture(models = Array.from({ length: 3 }, () => meshFixture().bytes)) {
  const parameters = new Uint8Array(428),
    view = new DataView(parameters.buffer);
  view.setUint16(4, 100, true);
  view.setUint16(6, 100, true);
  view.setInt16(0x2c, 4096, true);
  view.setInt16(0x2e, 4096, true);
  view.setInt16(0x30, 4096, true);
  for (let i = 0; i < 9; ++i) view.setInt16(0x42 + i * 2, 7168, true);
  const texture = new Uint8Array(8 + 64 * 16 * 2),
    tv = new DataView(texture.buffer);
  tv.setUint16(4, 64, true);
  tv.setUint16(6, 16, true);
  const vab = new Uint8Array(3104 + 16),
    vv = new DataView(vab.buffer);
  vv.setUint32(0, 0x56414270, true);
  vv.setUint32(4, 7, true);
  vv.setUint32(12, vab.length, true);
  vv.setUint16(18, 1, true);
  vv.setUint16(20, 1, true);
  vv.setUint16(22, 1, true);
  vab[32] = 1;
  vv.setUint16(2080 + 22, 1, true);
  vv.setUint16(2592 + 2, 2, true);
  const blocks = [parameters, ...models, texture, vab];
  const bytes = new Uint8Array(24 + blocks.reduce((n, block) => n + block.length, 0));
  const directory = new DataView(bytes.buffer);
  let cursor = 24;
  blocks.forEach((block, i) => {
    directory.setUint32(i * 4, cursor, true);
    bytes.set(block, cursor);
    cursor += block.length;
  });
  return bytes;
}

test("car CLI rolls back its own outputs and can retry after a conflict", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tm3-car-cli-"));
  const cli = new URL("../src/cli.ts", import.meta.url);
  const input = join(dir, "car.CAR");
  const blocked = join(dir, "car.special.vab");
  const run = () =>
    Bun.spawnSync([
      process.execPath,
      Bun.fileURLToPath(cli),
      "convert-car",
      input,
      "--output",
      join(dir, "car.MR"),
    ]);
  try {
    await Bun.write(input, carFixture());
    await mkdir(blocked);
    const failure = run();
    expect(failure.exitCode).toBe(1);
    expect(failure.stderr.toString()).toContain("car.special.vab");
    expect((await readdir(dir)).sort()).toEqual(["car.CAR", "car.special.vab"]);
    await rmdir(blocked);
    expect(run().exitCode).toBe(0);
    expect((await readdir(dir)).sort()).toEqual([
      "car.CAR",
      "car.MR",
      "car.conversion.json",
      "car.special.vab",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("TM3 order tables retain fixed stride, unused bytes and unreferenced faces", () => {
  const { bytes } = meshFixture(),
    model = readModel(bytes);
  expect(model.orders).toEqual(Array.from({ length: 16 }, (_, i) => [i % 2]));
  expect(model.order_unused_hex).toEqual(Array(16).fill("cd"));
  expect(model.unreferenced_faces).toEqual([1]);
  expect(model.faces[1].command).toBe(0xcd);
});
test("TM3 model parsing rejects bad referenced faces, indices, ranges and orders", () => {
  for (const corrupt of [
    ({ bytes, faceStart }) => {
      bytes[faceStart + 3] = 0xcd;
    },
    ({ bytes, faceStart }) => {
      bytes[faceStart + 16] = 3;
    },
    ({ view }) => {
      view.setInt16(44, -1, true);
    },
    ({ bytes, order }) => {
      bytes[order] = 3;
    },
    ({ bytes, order }) => {
      bytes[order + 1] = 2;
    },
    ({ bytes }) => {
      bytes[bytes.length - 1] = 1;
    },
  ]) {
    const fixture = meshFixture();
    corrupt(fixture);
    expect(() => readModel(fixture.bytes)).toThrow();
  }
  const { bytes, order } = meshFixture();
  expect(() => readModel(bytes.slice(0, order + 47))).toThrow("Missing order");
});
test("named parameters and unresolved spans reproduce all 428 original bytes", () => {
  const bytes = Uint8Array.from({ length: 428 }, (_, i) => i % 256),
    parsed = readParameters(bytes);
  const output = new Uint8Array(428),
    view = new DataView(output.buffer),
    covered = new Set();
  const sizes = { B: 1, b: 1, H: 2, h: 2, i: 4 };
  const setters = {
    B: "setUint8",
    b: "setInt8",
    H: "setUint16",
    h: "setInt16",
    i: "setInt32",
  };
  function span(offset, size) {
    for (let i = offset; i < offset + size; ++i) {
      expect(covered.has(i)).toBe(false);
      covered.add(i);
    }
  }
  for (const [name, offset, kind, count] of parameterFields) {
    const values = count === 1 ? [parsed[name]] : parsed[name];
    values.forEach((value, i) => view[setters[kind]](offset + i * sizes[kind], value, true));
    span(offset, count * sizes[kind]);
  }
  parsed.ai_sectors.forEach((sector, i) => {
    const offset = 0x8c + i * 20;
    view.setInt32(offset, sector.weight, true);
    output.set(sector.weapon_weights, offset + 4);
    span(offset, 20);
  });
  expect(covered.size).toBe(370);
  for (const unresolved of parsed.unresolved) {
    const raw = Buffer.from(unresolved.hex, "hex");
    output.set(raw, unresolved.offset);
    span(unresolved.offset, raw.length);
  }
  expect(covered.size).toBe(428);
  expect(output).toEqual(bytes);
  for (const size of [0, 427, 429]) expect(() => readParameters(new Uint8Array(size))).toThrow();
});
test("CAR directory and VAB checks reject truncation and overlapping blocks", () => {
  const source = carFixture();
  expect(readCar(source).models.length).toBe(3);
  for (const corrupt of [
    (bytes) => new DataView(bytes.buffer).setUint32(0, 28, true),
    (bytes) => new DataView(bytes.buffer).setUint32(4, 24, true),
    (bytes) => new DataView(bytes.buffer).setUint32(20, bytes.length + 4, true),
    (bytes) => {
      bytes[new DataView(bytes.buffer).getUint32(20, true)] = 0;
    },
    (bytes) => {
      const view = new DataView(bytes.buffer);
      view.setUint32(view.getUint32(20, true) + 12, 9999, true);
    },
  ]) {
    const bytes = source.slice();
    corrupt(bytes);
    expect(() => readCar(bytes)).toThrow();
  }
  expect(() => readCar(source.slice(0, -4))).toThrow();
});
test("texture sampling resolves 4-bit pixels through the original CLUT", () => {
  const bytes = new Uint8Array(8 + 64 * 2 * 2),
    view = new DataView(bytes.buffer);
  view.setUint16(4, 64, true);
  view.setUint16(6, 2, true);
  view.setUint16(8, 0x21, true);
  view.setUint16(8 + 64 * 2 + 2, 31, true);
  view.setUint16(8 + 64 * 2 + 4, 31 << 5, true);
  const texture = new TextureRectangle(bytes);
  expect(texture.sample(0, 64, 0, 0)).toEqual([255, 0, 0, 255]);
  expect(texture.sample(0, 64, 1, 0)).toEqual([0, 255, 0, 255]);
  expect(texture.sample(0, 64, 2, 0)).toEqual([0, 0, 0, 0]);
  expect(() => texture.sample(384, 64, 0, 0)).toThrow("Reserved texture depth");
  expect(() => texture.word(64, 0)).toThrow("outside");
  expect(() => new TextureRectangle(bytes.slice(0, -4))).toThrow();
});
test("converted CAR validates as TM4 MR with bounds and mounts", async () => {
  const source = carFixture(),
    original = source.slice();
  const result = await convertCar(source),
    { root } = await readMr(result.archive);
  expect(source).toEqual(original);
  expect(result.metadata.validation.errors).toEqual([]);
  expect(result.metadata.validation.lods).toBe(3);
  expect(result.metadata.validation.maxScratchBytes).toBeLessThanOrEqual(800);
  expect(result.metadata.source_physics_box).toEqual([
    [0, -32, 0],
    [32, 0, 32],
  ]);
  expect(root.files.get("machineGuns").arraySize).toBe(2);
  expect(root.files.get("tm3SpecialMount").arraySize).toBe(1);
  expect(result.specialVab).toEqual(readCar(source).specialVab);
  const physics = root.folders.get("physics");
  for (const name of ["physicsBoxWidth", "physicsBoxHeight", "physicsBoxLength"]) {
    const bytes = physics.files.get(name).bytes;
    expect(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(0, true)).toBe(
      32,
    );
  }
  for (const scale of [0, -1, NaN, Infinity])
    await expect(convertCar(source, scale)).rejects.toThrow("Scale");
  new DataView(source.buffer).setInt16(24 + 0x42 + 4 * 2, 1234, true);
  await expect(convertCar(source)).rejects.toThrow("difficulty");
});

test("car shadows preserve the atlas and project intact geometry into TM4's subtractive texture", async () => {
  const source = carFixture();
  const view = new DataView(source.buffer);
  const bitmap = view.getUint32(16, true);
  // Unreferenced source pixels can still belong to a behavior module.
  view.setUint16(bitmap + 8 + 40, 0x4321, true);
  const { root } = await convertCar(source);
  const display = root.folders.get("display").files;
  const texture = new TextureRectangle(display.get("car.bit").bytes);
  const data = display.get("shadow").bytes;
  const uv = new DataView(data.buffer, data.byteOffset);
  const clut = uv.getUint16(2, true),
    page = uv.getUint16(6, true);
  expect(texture.height).toBeLessThanOrEqual(64);
  expect(texture.word(20, 0)).toBe(0x4321);
  expect(texture.word(0, 0)).toBe(0); // live transparent face texel
  for (let i = 0; i < 16; i++) expect(texture.word(i, 0)).toBe(0); // original face CLUT
  expect((page >> 5) & 3).toBe(2);
  expect([data[4] - data[0], data[5] - data[1]]).toEqual([31, 31]);
  function color(u, v) {
    u += data[0];
    v += data[1];
    const word = texture.word((page & 15) * 64 + (u >> 2), ((page >> 4) & 1) * 256 + v);
    return texture.word((clut & 63) * 16 + ((word >> ((u % 4) * 4)) & 15), clut >> 6);
  }
  // This asymmetric fixture has an empty front-right corner, a solid rear-left
  // corner and a partially covered diagonal. Reversed UV axes change the result.
  expect(color(28, 3)).toBe(0);
  expect(color(3, 28)).toBe(0xa94a);
  const edgeColor = color(16, 16);
  expect(edgeColor & 0x8000).toBe(0x8000);
  expect(edgeColor & 31).toBeGreaterThan(0);
  expect(edgeColor & 31).toBeLessThan(10);
  // Across the straight left edge the penumbra fades all the way to the quad boundary.
  const ramp = [0, 1, 2, 3].map((u) => color(u, 24) & 31);
  expect(ramp[0]).toBe(0);
  expect(ramp[1]).toBeGreaterThan(0);
  expect(ramp[2]).toBeGreaterThan(ramp[1]);
  expect(ramp[2]).toBeLessThan(10);
  expect(ramp[3]).toBe(10);
});

test("custom animation pivots are recorded and baked into resource-only geometry", async () => {
  const source = carFixture(),
    data = new DataView(source.buffer);
  // The second group of detailed LOD is a moving part, not a wheel.
  const modelStart = data.getUint32(4, true),
    group = modelStart + 44 + 24;
  [10, -20, 30].forEach((v, i) => data.setInt16(group + 16 + i * 2, v, true));
  data.setUint8(group + 22, 1);
  data.setInt8(group + 23, 4);
  const result = await convertCar(source);
  const custom = result.metadata.groups[0][1];
  expect(custom.converted_pivot).toEqual([10, -20, 30]);
  expect(custom.custom_vertices_in_body_space).toBe(true);
  const resolution = result.root.folders.get("display").folders.get("resolution");
  const record = resolution.folders.get("r0").folders.get("Groups").files.get(custom.name).bytes;
  const firstVertex = new DataView(record.buffer, record.byteOffset).getInt16(4, true);
  const vertices = resolution.files.get("VertexList").bytes;
  const view = new DataView(vertices.buffer, vertices.byteOffset);
  expect([0, 1, 2].map((axis) => view.getInt16(firstVertex * 8 + axis * 2, true))).toEqual([
    10, -20, 30,
  ]);
});

test("visibility selectors preserve body-space vertices in static and animated cars", async () => {
  const model = meshFixture();
  // Outlaw uses unflagged selectors 4 and 5 for alternate light-bar meshes.
  for (const [i, selector] of [4, 5].entries()) model.view.setInt8(44 + i * 24 + 23, selector);
  const { root, metadata } = await convertCar(carFixture([model.bytes, model.bytes, model.bytes]));
  const resolution = root.folders.get("display").folders.get("resolution");
  function checkPositions(animated) {
    const vertices = resolution.files.get("VertexList").bytes;
    const view = new DataView(vertices.buffer, vertices.byteOffset);
    for (const [lod, groups] of metadata.groups.entries()) {
      for (const group of groups) {
        const bytes = resolution.folders
          .get("r" + lod)
          .folders.get("Groups")
          .files.get(group.name).bytes;
        const record = new DataView(bytes.buffer, bytes.byteOffset);
        expect(record.getUint8(30)).toBe(Number(animated));
        for (const frame of [0, 12]) {
          const vertex = record.getInt16(frame + 4, true);
          const positions = [0, 1, 2].map((i) =>
            [0, 1, 2].map(
              (axis) =>
                view.getInt16((vertex + i) * 8 + axis * 2, true) +
                (animated ? record.getInt16(24 + axis * 2, true) : 0),
            ),
          );
          expect(positions).toEqual([
            [0, 0, 0],
            [32, 0, 0],
            [0, -32, 32],
          ]);
        }
      }
    }
  }
  checkPositions(false);
  enableCarAnimations(root, metadata.groups);
  checkPositions(true);
});

// Distinct triangles force two render chunks in the larger damage state.
function splitMeshFixture(counts) {
  const groups = 3,
    faces = 32,
    vertices = faces * 3;
  const faceStart = 44 + groups * 24;
  const vertexStart = faceStart + faces * 20;
  const order = vertexStart + vertices * 8 + 4;
  const bytes = new Uint8Array(order + 16 * (groups + 1));
  const view = new DataView(bytes.buffer);
  [8, order, groups, faces, vertices].forEach((v, i) => view.setUint32(i * 4, v, true));
  for (let group = 0; group < groups; ++group) {
    for (let frame = 0; frame < 2; ++frame) {
      const count = group === 0 ? counts[frame] : group === 1 ? 1 : 0;
      [0, count, 0, count * 3].forEach((v, i) =>
        view.setInt16(44 + group * 24 + frame * 8 + i * 2, v, true),
      );
    }
    view.setInt8(44 + group * 24 + 23, -1);
  }
  for (let face = 0; face < faces; ++face) {
    const start = faceStart + face * 20;
    bytes[start + 3] = 0x24;
    bytes[start + 4] = face;
    bytes.set([face * 3, face * 3 + 1, face * 3 + 2, 255], start + 16);
    [
      [face * 2, 0, 0],
      [face * 2 + 1, -1, 0],
      [face * 2, 0, 1],
    ].forEach((point, i) =>
      point.forEach((v, axis) =>
        view.setInt16(vertexStart + (face * 3 + i) * 8 + axis * 2, v, true),
      ),
    );
  }
  for (let i = 0; i < 16; ++i) bytes.set([3, 0, 1, 2], order + i * 4);
  return bytes;
}

for (const counts of [
  [32, 1],
  [1, 32],
  [32, 0],
  [0, 32],
]) {
  test(`conversion preserves every face across unequal damage states ${counts}`, async () => {
    const model = splitMeshFixture(counts);
    const result = await convertCar(carFixture([model, model, model]));
    const { root } = await readMr(result.archive);
    const resolution = root.folders.get("display").folders.get("resolution");
    const view = (entry) =>
      new DataView(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);
    const faces = view(resolution.files.get("FaceList"));
    const vertices = view(resolution.files.get("VertexList"));
    expect(result.metadata.validation.errors).toEqual([]);
    expect(result.metadata.validation.maxScratchBytes).toBeLessThanOrEqual(800);
    for (let lod = 0; lod < 3; ++lod) {
      const level = resolution.folders.get(`r${lod}`);
      const groups = result.metadata.groups[lod];
      const split = groups.filter((group) => group.source_group === 0);
      expect(split.length).toBe(2);
      for (let frame = 0; frame < 2; ++frame) {
        const actual = [];
        for (const group of split) {
          const data = view(level.folders.get("Groups").files.get(group.name));
          const offset = frame * 12;
          const first = data.getInt16(offset, true),
            count = data.getInt16(offset + 2, true);
          const firstVertex = data.getInt16(offset + 4, true);
          if (!count) {
            expect(data.getInt16(offset + 6, true)).toBe(0);
            expect(data.getInt16(offset + 10, true)).toBe(0);
          }
          for (let i = first; i < first + count; ++i) {
            const points = [0, 1, 2].map((corner) => {
              const vertex = firstVertex + faces.getUint8(i * 24 + 16 + corner);
              return [0, 1, 2].map((axis) => vertices.getInt16(vertex * 8 + axis * 2, true));
            });
            actual.push({ u: faces.getUint8(i * 24 + 4), points });
          }
        }
        expect(actual).toEqual(
          Array.from({ length: counts[frame] }, (_, face) => ({
            u: face,
            points: [
              [face * 2, 0, 0],
              [face * 2 + 1, -1, 0],
              [face * 2, 0, 1],
            ],
          })),
        );
      }
      const empty = groups.find((group) => group.source_group === 2);
      const data = view(level.folders.get("Groups").files.get(empty.name));
      for (const offset of [2, 6, 10, 14, 18, 22]) expect(data.getInt16(offset, true)).toBe(0);
      const order = level.files.get("viewtable").bytes;
      for (let i = 0; i < 16; ++i)
        expect([...order.slice(i * (groups.length + 1), (i + 1) * (groups.length + 1))]).toEqual([
          groups.length,
          ...groups.map((_, index) => index),
        ]);
    }
  });
}

test("conversion rejects unknown referenced geometry instead of dropping it", async () => {
  const source = carFixture();
  const data = new DataView(source.buffer);
  const model = data.getUint32(4, true);
  const face = model + 44 + data.getUint32(model + 8, true) * 24;
  source[face + 3] = 0x20;
  await expect(convertCar(source)).rejects.toThrow("Unsupported referenced face");
});

test("zero-area TM3 faces retain every corner and use zero lighting normals", async () => {
  const model = meshFixture();
  model.bytes.set([0, 0, 2, 255], model.faceStart + 16);
  const source = carFixture(Array.from({ length: 3 }, () => model.bytes));
  const converted = await convertCar(source);
  const resolution = converted.root.folders.get("display").folders.get("resolution");
  const groups = resolution.folders.get("r0").folders.get("Groups");
  const group = groups.files.get(converted.metadata.groups[0][0].name).bytes;
  const firstFace = new DataView(group.buffer, group.byteOffset).getInt16(0, true);
  const faces = resolution.files.get("FaceList").bytes;
  const face = faces.slice(firstFace * 24, firstFace * 24 + 24);
  expect(face[16]).toBe(face[17]);
  expect(face[18]).not.toBe(face[16]);
  const normals = resolution.files.get("VertexNormalList").bytes;
  for (const ni of face.slice(20, 24)) {
    expect([...normals.slice(ni * 8, ni * 8 + 6)]).toEqual([0, 0, 0, 0, 0, 0]);
  }
  expect(converted.metadata.validation.errors).toEqual([]);
});

test("animation preparation restores local vertices, keeps pivots and enables custom callbacks", async () => {
  const source = carFixture();
  const data = new DataView(source.buffer);
  const group = data.getUint32(4, true) + 44 + 24;
  [10, -20, 30].forEach((v, i) => data.setInt16(group + 16 + i * 2, v, true));
  data.setUint8(group + 22, 1);
  data.setInt8(group + 23, 4);
  const converted = await convertCar(source);
  enableCarAnimations(converted.root, converted.metadata.groups);
  const resolution = converted.root.folders.get("display").folders.get("resolution");
  const bytes = resolution.folders
    .get("r0")
    .folders.get("Groups")
    .files.get(converted.metadata.groups[0][1].name).bytes;
  const record = new DataView(bytes.buffer, bytes.byteOffset);
  const firstVertex = record.getInt16(4, true);
  const vertices = resolution.files.get("VertexList").bytes;
  const view = new DataView(vertices.buffer, vertices.byteOffset);
  expect([0, 1, 2].map((axis) => view.getInt16(firstVertex * 8 + axis * 2, true))).toEqual([
    0, 0, 0,
  ]);
  expect([0, 1, 2].map((axis) => record.getInt16(24 + axis * 2, true))).toEqual([10, -20, 30]);
  expect(bytes[30]).toBe(1);
  expect(() => enableCarAnimations(converted.root, converted.metadata.groups)).toThrow(
    "already enabled",
  );
});

test("FIRE's F4 records retain geometry and RGB but remain undrawn like the original", async () => {
  const mesh = meshFixture();
  mesh.bytes[mesh.faceStart + 3] = 0x28;
  mesh.bytes.set([0, 150, 255], mesh.faceStart);
  mesh.bytes.fill(0xcd, mesh.faceStart + 4, mesh.faceStart + 16);
  mesh.bytes.set([0, 1, 2, 0], mesh.faceStart + 16);
  const parsed = readModel(mesh.bytes);
  expect(parsed.faces[0].rendered).toBe(false);
  expect(parsed.faces[0].color_raw).toEqual([0, 150, 255]);
  const converted = await convertCar(carFixture(Array.from({ length: 3 }, () => mesh.bytes)));
  expect(converted.metadata.undrawn_faces).toHaveLength(3);
  expect(converted.metadata.validation.undrawnFaces).toBe(12);
  expect(converted.metadata.validation.errors).toEqual([]);
  const resolution = converted.root.folders.get("display").folders.get("resolution");
  const bytes = resolution.files.get("FaceList").bytes;
  for (let i = 0; i < bytes.length; i += 24) {
    expect(bytes[i]).toBe(0x28);
    expect([...bytes.slice(i + 4, i + 16)]).toEqual(Array(12).fill(0xcd));
    expect(bytes[i + 16]).toBe(bytes[i + 19]);
  }
  // Inert does not mean malformed references may escape validation.
  mesh.bytes[mesh.faceStart + 19] = 3;
  expect(() => readModel(mesh.bytes)).toThrow("outside group");
});

test("CAR parsing and conversion reject an audio bank without tone/sample tables", async () => {
  const original = carFixture();
  const start = new DataView(original.buffer).getUint32(20, true);
  const source = original.slice(0, start + 2080);
  const view = new DataView(source.buffer);
  view.setUint32(start + 12, 2080, true);
  view.setUint16(start + 18, 1, true);
  view.setUint16(start + 20, 1, true);
  view.setUint16(start + 22, 1, true);
  source[start + 32] = 1;
  const before = source.slice();
  expect(() => readCar(source)).toThrow("Truncated VAB tone/sample tables");
  await expect(convertCar(source)).rejects.toThrow("Truncated VAB tone/sample tables");
  expect(source).toEqual(before);
});

for (const failure of ["missing group", "coordinate overflow", "overlapping vertices"]) {
  test(`animation preparation is atomic on late ${failure} and can be retried`, async () => {
    const source = carFixture();
    const view = new DataView(source.buffer);
    for (const lod of [0, 1]) {
      const group = view.getUint32(4 + lod * 4, true) + 44 + 24;
      [10, -20, 30].forEach((value, axis) => view.setInt16(group + 16 + axis * 2, value, true));
      view.setUint8(group + 22, 1);
      view.setInt8(group + 23, 4);
    }
    const converted = await convertCar(source);
    const groups = structuredClone(converted.metadata.groups);
    const later = groups[1][1];
    if (failure === "missing group") later.name = "missing";
    if (failure === "coordinate overflow") later.converted_pivot[2] = 65536;
    if (failure === "overlapping vertices") groups[1].push(structuredClone(later));
    const before = writeMr(converted.root);
    expect(() => enableCarAnimations(converted.root, groups)).toThrow();
    expect(writeMr(converted.root)).toEqual(before);
    enableCarAnimations(converted.root, converted.metadata.groups);
    const fresh = await convertCar(source);
    enableCarAnimations(fresh.root, fresh.metadata.groups);
    expect(writeMr(converted.root)).toEqual(writeMr(fresh.root));
  });
}
test("body seams use TM4 winding and equal face weights, preserving creases, moving parts and damage states", async () => {
  async function firstCorner(secondGroupSelector, outerY, frame) {
    const fixture = meshFixture();
    const { faceStart, order } = fixture;
    const data = new Uint8Array(fixture.bytes.length + 8);
    data.set(fixture.bytes.slice(0, order));
    data.set(fixture.bytes.slice(order), order + 8);
    const view = new DataView(data.buffer);
    view.setUint32(4, order + 8, true);
    view.setUint32(16, 4, true);
    const vertices = faceStart + 40;
    [
      [0, 0, 0],
      [32, 0, 0],
      [0, 32, 0],
      [0, outerY, 64],
    ].forEach((p, i) => p.forEach((v, a) => view.setInt16(vertices + 8 * i + 2 * a, v, true)));
    data.fill(0, faceStart + 20, faceStart + 40);
    data[faceStart + 23] = 0x24;
    data.set([1, 0, 3, 255], faceStart + 36);
    for (const offset of [0, 8]) {
      view.setInt16(68 + offset, 1, true);
      view.setInt16(68 + offset + 6, 4, true);
    }
    view.setInt16(68 + 8 + 2, 0, true); // The second face is gone in the damaged mesh.
    view.setInt8(68 + 23, secondGroupSelector);
    const { root, metadata } = await convertCar(carFixture([data, data, data]));
    const r = root.folders.get("display").folders.get("resolution");
    const group = r.folders
      .get("r0")
      .folders.get("Groups")
      .files.get(metadata.groups[0][0].name).bytes;
    const g = new DataView(group.buffer, group.byteOffset);
    const face = g.getInt16(frame, true),
      base = g.getInt16(frame + 8, true);
    const index = base + r.files.get("FaceList").bytes[face * 24 + 20];
    const n = r.files.get("VertexNormalList").bytes;
    const normals = new DataView(n.buffer, n.byteOffset);
    return [0, 2, 4].map((a) => normals.getInt16(index * 8 + a, true));
  }
  expect(await firstCorner(-1, -64, 0)).toEqual([0, 1567, 3784]);
  expect(await firstCorner(-1, 0, 0)).toEqual([0, 0, 4096]);
  expect(await firstCorner(4, -64, 0)).toEqual([0, 0, 4096]);
  expect(await firstCorner(-1, -64, 12)).toEqual([0, 0, 4096]);
});
