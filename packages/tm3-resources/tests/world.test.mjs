import { expect, test } from "bun:test";

import {
  convertWorld,
  readTerrain,
  readWorld,
  validateWorldTextures,
  worldPolygons,
  WorldVram,
} from "@rusty-metal-4/tm3-resources";
import { readMr } from "@tm4/resources/compatibility/mr";

function container(parts) {
  parts = parts.map((part) => {
    const bytes = new Uint8Array(Math.ceil(part.length / 4) * 4);
    bytes.set(part);
    return bytes;
  });
  const bytes = new Uint8Array(
    parts.length * 4 + parts.reduce((sum, part) => sum + part.length, 0),
  );
  const view = new DataView(bytes.buffer);
  let cursor = parts.length * 4;
  parts.forEach((part, i) => {
    view.setUint32(i * 4, cursor, true);
    bytes.set(part, cursor);
    cursor += part.length;
  });
  return bytes;
}
function rectangle(x, y, width, height, words = []) {
  const bytes = new Uint8Array(8 + width * height * 2),
    view = new DataView(bytes.buffer);
  [x, y, width, height].forEach((v, i) => view.setUint16(i * 2, v, true));
  words.forEach((v, i) => view.setUint16(8 + i * 2, v, true));
  return bytes;
}
function images(last = rectangle(100, 100, 1, 1)) {
  const palette = Array(16).fill(0);
  palette[1] = 31;
  palette[2] = 31 << 5;
  return container([
    rectangle(0, 0, 2, 2, Array(4).fill(0x1111)),
    rectangle(32, 32, 16, 1, palette),
    last,
  ]);
}
function fixture(vertexCount = 4, objectSize = 12) {
  const squares = 0x283c,
    textures = squares + 56,
    objects = textures + 48;
  const indices = objects + objectSize,
    collisions = indices + 4,
    surfaces = collisions + 76,
    faces = surfaces + 64,
    vertices = faces + 40;
  const bytes = new Uint8Array(vertices + vertexCount * 8 + 4),
    view = new DataView(bytes.buffer);
  const u16 = (o, v) => view.setUint16(o, v, true),
    u32 = (o, v) => view.setUint32(o, v, true);
  bytes.fill(0xff, 0, 0x2000);
  u16(0, 0);
  u16(0x2000, 128);
  u16(0x2008, 4096);
  u16(0x2810, 1);
  u16(0x2812, 2);
  u32(0x2814, vertexCount);
  u16(0x2818, 2);
  u16(0x281a, 1);
  u16(0x281c, 2);
  u16(0x281e, 2);
  bytes[surfaces + 32] = 7;
  u32(0x2820, 1);
  u32(0x2824, objectSize);
  bytes[squares + 9] = 1;
  for (let level = 0; level < 2; ++level) {
    const offset = squares + 40 + level * 8;
    bytes[offset] = 4;
    bytes[offset + 1] = level ? 1 : 2;
    u32(offset + 4, level ? 16 : 0);
  }
  const clut = 32 * 64 + 2;
  for (let descriptor = 0; descriptor < 2; ++descriptor)
    for (let variant = 0; variant < 2; ++variant) {
      const offset = textures + descriptor * 24 + variant * 12,
        u = descriptor * 4 + variant * 2;
      bytes.set([u, 0], offset);
      u16(offset + 2, clut);
      bytes.set([u + 1, 0], offset + 4);
      u16(offset + 6, 0);
      bytes.set([u, 1, u + 1, 1], offset + 8);
    }
  bytes[objects] = 29;
  u16(objects + 10, objectSize);
  view.setInt32(collisions + 4, -4096, true);
  view.setInt16(collisions + 12 + 6, 4, true);
  bytes.set([128, 64, 32, 0x24, 0, 1, 2, 255], faces);
  bytes[faces + 10] = 1;
  u32(faces + 12, 0x1f800340);
  bytes.set(
    [10, 20, 30, 0x3c, 0, 1, 2, 3, 40, 50, 60, 0, 70, 80, 90, 0, 100, 110, 120, 0],
    faces + 16,
  );
  u32(faces + 36, textures + 24);
  [
    [0, 0, 0],
    [32, 0, 0],
    [0, 0, 32],
    [32, 0, 32],
  ].forEach((p, i) => {
    p.forEach((v, j) => view.setInt16(vertices + i * 8 + j * 2, v, true));
    view.setInt16(vertices + i * 8 + 6, 1234, true);
  });
  const ter = () =>
    container([
      bytes,
      new Uint8Array(),
      new Uint8Array(),
      new Uint8Array([...new TextEncoder().encode("AI DATA\0"), ...new Uint8Array(20)]),
      ...Array.from({ length: 4 }, () => new Uint8Array()),
    ]);
  return { bytes, view, squares, textures, objects, indices, collisions, faces, vertices, ter };
}

test("terrain resolves scratchpad textures and retains variable face extents, collision and object records", () => {
  const f = fixture(),
    world = readWorld(f.ter(), images()),
    terrain = world.terrain;
  expect(terrain.faces[0].texture).toBe(f.textures);
  expect(terrain.faces[16].texture).toBe(f.textures + 24);
  expect(terrain.faces[0].size).toBe(16);
  expect(terrain.faces[16].size).toBe(24);
  expect(terrain.faces[0].colors).toEqual(Array(4).fill([128, 64, 32]));
  expect(terrain.faces[16].colors).toEqual([
    [10, 20, 30],
    [40, 50, 60],
    [70, 80, 90],
    [100, 110, 120],
  ]);
  expect(terrain.vertices[0][3]).toBe(1234);
  expect(terrain.objects).toEqual([{ offset: f.objects, type: 29, size: 12 }]);
  expect(terrain.collisions[0].normal_raw).toEqual([0, -4096, 0]);
  expect(terrain.collisions[0].vertices_raw[0][3]).toBe(4);
  expect(terrain.square_collision_ranges).toEqual([[0, 1]]);
  expect(terrain.sections.find((s) => s.name === "collision_records").size).toBe(76);
  expect(world.blocks[1].size).toBe(0);
});
test("world views select detail and texture variants and explicitly include disabled faces", () => {
  const world = readWorld(fixture().ter(), images());
  expect([...worldPolygons(world)].length).toBe(1);
  expect([...worldPolygons(world, { detail: 1 })].length).toBe(0);
  const polygons = [
    ...worldPolygons(world, { detail: 1, textureVariant: 1, includeDisabled: true }),
  ];
  expect(polygons.length).toBe(1);
  expect(polygons[0].points.length).toBe(4);
  expect(polygons[0].uv).toEqual([
    [6, 0],
    [7, 0],
    [6, 1],
    [7, 1],
  ]);
  expect(polygons[0].points[3]).toEqual([32, 0, 32]);
  expect(validateWorldTextures(world)).toEqual([
    { detail: 0, texture_variant: 0, referenced_faces_including_disabled: 2, textures: 2 },
    { detail: 0, texture_variant: 1, referenced_faces_including_disabled: 2, textures: 2 },
    { detail: 1, texture_variant: 0, referenced_faces_including_disabled: 1, textures: 1 },
    { detail: 1, texture_variant: 1, referenced_faces_including_disabled: 1, textures: 1 },
  ]);
  expect(() => [...worldPolygons(world, { detail: 2 })]).toThrow("Invalid world view");
});
test("terrain rejects broken stream extents and cross-references", () => {
  for (const corrupt of [
    (f) => f.view.setUint32(0x2834, 0xffffffff, true),
    (f) => f.view.setUint16(0, 1, true),
    (f) => f.view.setInt16(f.indices, -1, true),
    (f) => f.view.setInt16(f.collisions + 18, 2, true),
    (f) => f.view.setUint16(f.squares + 10, 2, true),
    (f) => f.view.setUint16(f.squares + 42, 2, true),
    (f) => f.view.setUint32(f.squares + 44, 1, true),
    (f) => {
      f.bytes[f.faces + 4] = 4;
    },
    (f) => {
      f.bytes[f.faces + 3] = 0x20;
    },
    (f) => f.view.setUint32(f.faces + 12, f.textures + 1, true),
    (f) => f.view.setUint16(f.objects + 10, 10, true),
    (f) => f.view.setUint32(0x2820, 0, true),
    (f) => {
      f.bytes[f.bytes.length - 1] = 1;
    },
  ]) {
    const f = fixture();
    corrupt(f);
    expect(() => readTerrain(f.bytes)).toThrow();
  }
  expect(() => readTerrain(fixture().bytes.slice(0, -1))).toThrow();
});
test("world texture validation checks disabled geometry and both descriptor variants", () => {
  const f = fixture();
  f.bytes[f.textures + 24 + 12] = 100;
  const world = readWorld(f.ter(), images());
  expect([...worldPolygons(world)].length).toBe(1);
  expect(() => validateWorldTextures(world)).toThrow("outside IMG uploads");
  const ter = f.ter(),
    aiOffset = new DataView(ter.buffer).getUint32(12, true);
  ter[aiOffset] = 0;
  expect(() => readWorld(ter, images())).toThrow("AI block");
});
test("IMG composes uploads in order and distinguishes loaded zero from missing pixels", () => {
  const vram = new WorldVram(images(rectangle(0, 0, 1, 1, [0x2222])));
  expect(vram.word(0, 0)).toBe(0x2222);
  expect(vram.sample(0, 2050, 0, 0)).toEqual([0, 255, 0, 255]);
  expect(vram.word(32, 32)).toBe(0);
  expect(() => vram.word(99, 99)).toThrow("outside IMG uploads");
  expect(() => vram.word(1024, 0)).toThrow("out of bounds");
});
test("shared texture sampling supports indexed 4/8-bit and direct 16-bit PS1 formats", () => {
  const palette = Array(256).fill(0);
  palette[15] = 31;
  palette[31] = 0x7fff;
  const vram = new WorldVram(
    container([
      rectangle(0, 0, 1, 1, [31]),
      rectangle(32, 32, 256, 1, palette),
      rectangle(100, 100, 1, 1),
    ]),
  );
  expect(vram.sample(0, 2050, 0, 0)).toEqual([255, 0, 0, 255]);
  expect(vram.sample(128, 2050, 0, 0)).toEqual([255, 255, 255, 255]);
  expect(vram.sample(128, 2050, 1, 0)).toEqual([0, 0, 0, 0]);
  expect(vram.sample(256, 0, 0, 0)).toEqual([255, 0, 0, 255]);
  expect(() => vram.sample(384, 0, 0, 0)).toThrow("Reserved texture depth");
});

test("default conversion uses the far texture only for exclusively distant faces", async () => {
  for (const shared of [false, true]) {
    const f = fixture();
    f.bytes[f.squares + 41] = shared ? 2 : 1;
    const result = await convertWorld(f.ter(), images());
    const { root } = await readMr(result.archive);
    const faces = root.folders.get("world").folders.get("displayPolys").files.get("faceData").bytes;
    const view = new DataView(faces.buffer, faces.byteOffset, faces.byteLength);
    expect(view.getUint32(12, true)).toBe(0);
    expect(view.getUint32(36, true)).toBe(shared ? 24 : 36);
    expect(result.metadata.texture_variant).toBe("by-detail");
  }
});

for (const textureVariant of [0, 1]) {
  test(`world conversion emits TM4 loader streams with texture variant ${textureVariant}`, async () => {
    const f = fixture();
    // Source pointer slots and destruction IDs must not leak into TM4 runtime state.
    f.bytes.fill(0xcd, f.squares + 12, f.squares + 40);
    f.view.setInt16(f.collisions + 26, 0, true);
    f.view.setInt16(f.collisions + 34, 123, true);
    f.view.setInt16(f.collisions + 50, 1, true);
    const ter = f.ter(),
      img = images();
    const before = [ter.slice(), img.slice()];
    const converted = await convertWorld(ter, img, { textureVariant });
    const { root: registry } = await readMr(converted.archive);
    const root = registry.folders.get("world");
    function entry(folder, name) {
      return root.folders.get(folder).files.get(name);
    }
    function bytes(folder, name) {
      return entry(folder, name).bytes;
    }
    function view(folder, name) {
      const data = bytes(folder, name);
      return new DataView(data.buffer, data.byteOffset, data.byteLength);
    }
    expect(converted.metadata.faces).toBe(2);
    expect(converted.metadata.object_types).toEqual({ 29: 1 });
    const squares = bytes("squares", "squareData");
    expect([...squares.slice(12, 40)]).toEqual(Array(28).fill(0));
    expect(squares.slice(40)).toEqual(f.bytes.slice(f.squares + 40, f.squares + 56));
    expect(view("displayPolys", "faceData").getUint32(12, true)).toBe(textureVariant * 12);
    expect(view("displayPolys", "faceData").getUint32(36, true)).toBe(24 + textureVariant * 12);
    // Face metadata, including initially disabled detail geometry, is preserved.
    expect(bytes("displayPolys", "faceData").slice(0, 12)).toEqual(
      f.bytes.slice(f.faces, f.faces + 12),
    );
    expect(bytes("displayPolys", "faceData").slice(16, 36)).toEqual(
      f.bytes.slice(f.faces + 16, f.faces + 36),
    );
    expect(bytes("displayPolys", "vertexData")).toEqual(f.bytes.slice(f.vertices, f.vertices + 32));
    const collision = view("collisionPolys", "faceData");
    expect(collision.byteLength).toBe(80);
    expect(collision.getUint32(0, true)).toBe(0);
    expect(collision.getInt32(8, true)).toBe(-4096);
    expect(collision.getInt16(22, true)).toBe(4);
    expect(collision.getInt16(30, true)).toBe(0);
    expect(collision.getInt16(38, true)).toBe(0);
    expect(collision.getInt16(54, true)).toBe(1);
    expect(bytes("collisionPolys", "indexData").slice(0, 4)).toEqual(
      f.bytes.slice(f.indices, f.indices + 4),
    );
    expect(bytes("trackCrap", "data")[32]).toBe(7);
    expect(root.folders.has("images")).toBe(false);
    expect(
      new TextDecoder().decode(root.files.get("textureBankOverlay").bytes).split("\0")[0],
    ).toBe("/resourcePacks/tm3/reflections.bit");
    expect([...bytes("textures", "reflchro")]).toEqual([0, 0, 0, 0, 63, 63, 10, 1]);
    expect([...bytes("textures", "reflspec")]).toEqual([64, 0, 0, 0, 127, 63, 10, 1]);
    const bank = root.files.get("textureBank").bytes;
    expect(bank.length).toBe(1024 * 512 * 2);
    const bankView = new DataView(bank.buffer, bank.byteOffset);
    const vram = new WorldVram(img);
    for (const rectangle of vram.rectangles)
      for (let y = rectangle.y; y < rectangle.y + rectangle.height; ++y)
        for (let x = rectangle.x; x < rectangle.x + rectangle.width; ++x)
          expect(bankView.getUint16((y * 1024 + x) * 2, true)).toBe(vram.word(x, y));
    const startpoints = root.files.get("startpoints");
    expect(root.files.get("spawnGroundClearance").bytes).toEqual(Uint8Array.of(96, 0, 0, 0));
    expect(startpoints.type).toBe(26);
    expect(startpoints.arraySize).toBe(1);
    expect(startpoints.bytes).toEqual(f.bytes.slice(0x2000, 0x2010));
    expect([ter, img]).toEqual(before);
  });
}

test("Buffer views convert decorations identically without changing the input or its hash", async () => {
  const f = fixture(4, 56);
  f.bytes[f.objects] = 11;
  f.view.setUint32(f.objects + 52, f.textures + 24, true);
  f.bytes.fill(0xcd, f.squares + 12, f.squares + 40);
  const ter = f.ter();
  const img = images();
  const expected = await convertWorld(ter, img);
  function bufferView(bytes) {
    const buffer = Buffer.alloc(bytes.length + 17, 0xa5);
    const view = buffer.subarray(13, 13 + bytes.length);
    view.set(bytes);
    return view;
  }
  const terrain = bufferView(ter);
  const image = bufferView(img);
  const result = await convertWorld(terrain, image);
  expect(new Uint8Array(terrain)).toEqual(ter);
  expect(new Uint8Array(image)).toEqual(img);
  expect(result.metadata).toEqual(expected.metadata);
  expect(Buffer.compare(result.archive, expected.archive)).toBe(0);
});

test("both detail groups must fit the TM4 projection buffer", async () => {
  const f = fixture(97);
  for (const detail of [0, 1]) {
    const offset = f.squares + 40 + detail * 8;
    f.bytes[offset] = 96;
    await convertWorld(f.ter(), images());
    f.bytes[offset] = 97;
    await expect(convertWorld(f.ter(), images())).rejects.toThrow(`Square 0, detail ${detail}: 97`);
    f.bytes[offset] = 4;
  }
});

test("world conversion rejects invalid variants and missing texture uploads", async () => {
  const f = fixture();
  await expect(convertWorld(f.ter(), images(), { textureVariant: 2 })).rejects.toThrow("variant");
  f.bytes[f.textures + 24 + 12] = 100;
  await expect(convertWorld(f.ter(), images())).rejects.toThrow("outside IMG uploads");
});

test("texture animation checks each frame extent and the engine's eight counters", async () => {
  const { readTextureAnimations } = await import("../src/world/animation.ts");
  const records = new Uint8Array(48),
    view = new DataView(records.buffer);
  view.setUint32(0, 4, true);
  [64, 32, 2, 2].forEach((n, i) => view.setUint16(24 + i * 2, n, true));
  view.setUint32(36, 2, true);
  view.setUint32(40, 0, true);
  view.setUint32(44, 8, true);
  expect(readTextureAnimations(records, new Uint8Array(16), 1)[0].frame_offsets).toEqual([0, 8]);
  expect(() => readTextureAnimations(records, new Uint8Array(15), 1)).toThrow("pixel storage");
  expect(() => readTextureAnimations(records, new Uint8Array(16), 9)).toThrow("capacity");
  view.setUint32(0, 0, true);
  expect(() => readTextureAnimations(records, new Uint8Array(16), 1)).toThrow("overlaps");
});

test("horizon parsing validates all embedded packet slots and strips only zero tail", async () => {
  const { readHorizon } = await import("../src/world/horizon.ts");
  const bytes = new Uint8Array(8 + 176 + 128 + 196 + 4);
  bytes.set([1, 1, 1]);
  let cursor = 8;
  for (const [stride, packetSize, code] of [
    [176, 36, 0x38],
    [128, 24, 0x28],
    [196, 40, 0x2c],
  ]) {
    for (let slot = 0; slot < 4; ++slot) {
      const packet = cursor + 32 + slot * packetSize;
      bytes[packet + 3] = packetSize / 4 - 1;
      bytes[packet + 7] = code;
    }
    cursor += stride;
  }
  expect(readHorizon(bytes).size).toBe(bytes.length - 4);
  expect(readHorizon(bytes).textured_packets).toHaveLength(4);
  expect(readHorizon(new Uint8Array())).toBeNull();
  bytes[bytes.length - 1] = 1;
  expect(() => readHorizon(bytes)).toThrow("extent");
  bytes[bytes.length - 1] = 0;
  for (const offset of [8 + 35, 8 + 176 + 35 + 2 * 24, 8 + 176 + 128 + 35 + 3 * 40]) {
    const valid = bytes[offset];
    for (const invalid of [0, valid + 1]) {
      bytes[offset] = invalid;
      expect(() => readHorizon(bytes)).toThrow("packet length");
    }
    bytes[offset] = valid;
  }
  bytes[8 + 32 + 3 * 36 + 7] = 0;
  expect(() => readHorizon(bytes)).toThrow("packet");
});

test("teleporter records become startup instances with original position, radius and exit", async () => {
  const { readWorldObjects } = await import("@rusty-metal-4/tm3-resources");
  const f = fixture();
  // Expand the existing 12-byte object to the full TM3 teleporter record.
  const source = new Uint8Array(f.bytes.length + 16);
  source.set(f.bytes.slice(0, f.objects), 0);
  source.set(f.bytes.slice(f.objects + 12), f.objects + 28);
  const view = new DataView(source.buffer);
  view.setUint32(0x2824, 28, true);
  source[f.objects] = 7;
  view.setUint16(f.objects + 2, 120, true);
  view.setUint16(f.objects + 10, 28, true);
  [11, -22, 33].forEach((value, i) => view.setInt16(f.objects + 4 + i * 2, value, true));
  [44, -55, 66, 0, 0, 0, 4096, 0].forEach((value, i) =>
    view.setInt16(f.objects + 12 + i * 2, value, true),
  );
  const ter = container([
    source,
    new Uint8Array(),
    new Uint8Array(),
    new Uint8Array([...new TextEncoder().encode("AI DATA\0"), ...new Uint8Array(20)]),
    ...Array.from({ length: 4 }, () => new Uint8Array()),
  ]);
  const world = readWorld(ter, images());
  expect(readWorldObjects(world)[0].kind).toBe("teleporter");
  const converted = await convertWorld(ter, images());
  const startup = converted.root.folders
    .get("objects")
    .folders.get("teleporter")
    .folders.get("instances")
    .folders.get("startup");
  const instance = [...startup.folders.values()][0];
  const words = (name) => {
    const b = instance.files.get(name).bytes;
    const v = new DataView(b.buffer, b.byteOffset);
    return Array.from({ length: b.length / 2 }, (_, i) => v.getInt16(i * 2, true));
  };
  expect(words("pos")).toEqual([11, -22, 33, 0]);
  expect(words("dest")).toEqual([44, -55, 66, 0, 0, 0, 4096, 0]);
  expect(instance.files.get("radius").bytes[0]).toBe(120);
  expect(converted.metadata.teleporters).toBe(1);
});
