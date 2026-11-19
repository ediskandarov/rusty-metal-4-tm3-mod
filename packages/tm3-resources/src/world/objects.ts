import { at, Binary, requireValue } from "../shared/binary.ts";
import type { WorldResources } from "./index.ts";
import { pickupTypes } from "./pickups.ts";

/** Resource fields consumed by the original constructors; numeric classes are TM3 IDs. */
export function readWorldObjects(world: WorldResources) {
  const terrain = at(world.blocks, 0).bytes;
  return world.terrain.objects.map((object) => {
    const bytes = terrain.slice(object.offset, object.offset + object.size),
      data = new Binary(bytes);
    const position = data.shorts(4, 3);
    if (object.type === 7) {
      requireValue(bytes.length === 28, "Unsupported teleporter record size");
      return {
        ...object,
        bytes,
        position,
        kind: "teleporter" as const,
        radius: data.u16(2),
        destination: data.shorts(12, 3),
        heading: data.shorts(20, 3),
      };
    }
    if (object.type === 2) {
      requireValue(bytes.length === 20, "Unsupported pickup record size");
      const subtype = data.u8(12);
      return {
        ...object,
        bytes,
        position,
        kind: "pickup" as const,
        subtype,
        pickup: pickupTypes[subtype] ?? null,
        regeneration: data.u8(13),
        units: Math.max(1, data.u8(14)),
        destruction_group: data.i32(16),
      };
    }
    if (object.type === 11) {
      requireValue(bytes.length === 56, "Unsupported decorative quad record size");
      return {
        ...object,
        bytes,
        position,
        kind: "decoration" as const,
        points: [12, 20, 28, 36].map((offset) => data.shorts(offset, 3)),
        texture: data.u32(52),
      };
    }
    if (object.type === 23) {
      const quads = data.u8(27);
      requireValue(bytes.length === 28 + quads * 52, "Unsupported moving prop record size");
      return { ...object, bytes, position, kind: "prop" as const, motion: data.u8(26), quads };
    }
    return { ...object, bytes, position, kind: "unknown" as const };
  });
}
