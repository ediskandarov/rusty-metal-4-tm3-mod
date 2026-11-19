import { expect, test } from "bun:test";

import { readMr } from "@tm4/resources/compatibility/mr";
import { directory, stringValue, writeMr } from "@tm4/resources/mods/mr-writer";

import { writeWorldObjects } from "../src/world/instances.ts";
import { readWorldObjects } from "../src/world/objects.ts";
import { readPickupModels } from "../src/world/pickup-models.ts";

test("TER pickups retain their native type, coordinates, quantity and base respawn interval in MR", async () => {
  const rows = [
    // subtype, seconds, quantity, destruction group
    [2, 60, 3, -1],
    [3, 30, 4, -1],
    [0, 120, 45, -1],
    [15, 120, 100, -1],
    [14, 60, 3, -1],
    [6, 30, 0, -1],
    [1, 60, 4, 0],
    [11, 255, 2, -1],
    [1, 255, 4, -1],
  ];
  const bytes = new Uint8Array(20 * rows.length);
  const view = new DataView(bytes.buffer);
  const objects = rows.map(([subtype, rate, units, group], i) => {
    const offset = i * 20;
    view.setInt16(offset + 4, -111, true);
    view.setInt16(offset + 6, 222, true);
    view.setInt16(offset + 8, -333, true);
    bytes.set([subtype, rate, units], offset + 12);
    view.setInt32(offset + 16, group, true);
    return { offset, type: 2, size: 20 };
  });
  const records = readWorldObjects({
    blocks: [{ bytes }],
    terrain: { objects },
  });
  expect(records[0].pickup.inventorySlot).toBe(2);
  expect(records[1].pickup.inventorySlot).toBe(1);
  const root = directory();
  expect(writeWorldObjects(root, records)).toEqual({
    teleporters: 0,
    pickups: 8,
    released_pickups: 0,
    omitted_pickups: { linked: 1, unsupportedType: 0 },
  });
  const { directories } = await readMr(writeMr(root));
  const startup = directories.get("Root/objects/powerup/instances/startup");
  const actual = [...startup.folders.values()].map(({ files }) => {
    expect([
      ...new Int16Array(files.get("pos").bytes.buffer, files.get("pos").bytes.byteOffset, 4),
    ]).toEqual([-111, 222, -333, 0]);
    const value = (key) => {
      const b = files.get(key).bytes;
      return new DataView(b.buffer, b.byteOffset).getInt32(0, true);
    };
    return [stringValue(files.get("type")), value("units"), value("regenRate")];
  });
  expect(actual).toEqual([
    ["power", 3, 60],
    ["homing", 4, 30],
    ["health", 1843, 120],
    ["healthFull", 4096, 120],
    ["turbo", 4096, 60],
    ["napalm", 1, 30],
    ["proximity", 2, 255],
    ["fire", 4, 255],
  ]);
});

test("a group releases each linked pickup at its original placement", async () => {
  const root = directory(),
    destroyables = directory(),
    group = directory();
  destroyables.folders.set("tm3_group_1", group);
  const data = [0x40, 0xb0].map((offset, i) => ({
    kind: "pickup",
    offset,
    pickup: { tm4Type: "power" },
    position: [offset, -24, 12],
    destruction_group: 1,
    units: i + 2,
    regeneration: 255,
  }));
  expect(writeWorldObjects(root, data, destroyables).released_pickups).toBe(2);
  const archive = await readMr(writeMr(root));
  const instances = archive.directories.get("Root/objects/powerup/instances");
  expect(instances.folders.has("startup")).toBe(false);
  for (const { offset, units } of data) {
    const name = "tm3_" + offset.toString(16);
    const event = group.folders.get("onDestroy").folders.get(name);
    expect(stringValue(event.files.get("instance"))).toBe("released/" + name);
    expect(stringValue(event.files.get("class"))).toBe("powerup");
    const files = instances.folders.get("released").folders.get(name).files;
    expect(files.get("units").bytes[0]).toBe(units);
    expect(files.get("singleUse").bytes[0]).toBe(1);
    expect(files.get("pos").bytes[0]).toBe(offset);
  }
});

test("ground models preserve authored face colours and resolve local vertex and face ranges", () => {
  const bytes = new Uint8Array(0x9c + 40 + 32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x88, 2, true);
  view.setUint32(0x8c, 4, true);
  bytes.set([3, 1, 1, 0, 20, 0, 0, 0], 8);
  const face = Uint8Array.from([
    24, 100, 230, 0x30, 0, 2, 1, 255, 1, 2, 3, 0, 4, 5, 6, 0, 0, 0, 0, 0,
  ]);
  bytes.set(face, 0x9c + 20);
  bytes[0x9c + 40 + 8] = 93;
  const model = readPickupModels(bytes)[1];
  expect(model.type).toBe("fire");
  expect([...model.mesh.slice(0, 8)]).toEqual([3, 1, 0, 0, 0, 0, 0, 0]);
  expect(model.mesh.slice(8, 28)).toEqual(face);
  expect(model.mesh[28]).toBe(93);
  bytes[0x9c + 20 + 4] = 3;
  expect(() => readPickupModels(bytes)).toThrow("vertex outside group");
  expect(() => readPickupModels(bytes.subarray(0, bytes.length - 1))).toThrow("Truncated");
});
