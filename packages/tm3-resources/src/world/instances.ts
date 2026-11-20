import type { MrDirectory } from "@tm4/resources/compatibility/mr";
import { directory, stringEntry } from "@tm4/resources/mods/mr-writer";

import type { readWorldObjects } from "./objects.ts";

function intEntry(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return { type: 4, arraySize: 65535, bytes };
}

function vectorEntry(values: number[], type: number) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return { type, arraySize: 65535, bytes };
}

export function writeWorldObjects(
  root: MrDirectory,
  records: ReturnType<typeof readWorldObjects>,
  destroyables?: MrDirectory,
) {
  const teleporters = directory();
  const pickups = directory();
  const released = directory();
  const omittedPickups = { linked: 0, unsupportedType: 0 };
  for (const object of records) {
    if (object.kind !== "pickup" && object.kind !== "teleporter") continue;
    const instance = directory();
    const name = `tm3_${object.offset.toString(16)}`;
    if (object.kind === "pickup") {
      const type = object.pickup?.tm4Type;
      const group = destroyables?.folders.get(`tm3_group_${object.destruction_group}`);
      if (object.destruction_group >= 0 && !group) {
        ++omittedPickups.linked;
        continue;
      }
      if (!type) {
        ++omittedPickups.unsupportedType;
        continue;
      }
      // TM3 uses percentages for health, fills turbo, and counts ammo in shots.
      let units = object.units;
      if (type === "health" || type === "healthFull") units = Math.round((units * 4096) / 100);
      if (type === "turbo") units = 4096;
      instance.files.set("type", stringEntry(type));
      instance.files.set("units", intEntry(units));
      instance.files.set("regenRate", intEntry(object.regeneration));
      if (group) {
        const events = group.folders.get("onDestroy") ?? directory();
        const event = directory();
        event.files.set("class", stringEntry("powerup"));
        event.files.set("instance", stringEntry("released/" + name));
        events.folders.set(name, event);
        group.folders.set("onDestroy", events);
        released.folders.set(name, instance);
      } else pickups.folders.set(name, instance);
    } else {
      instance.files.set("dest", vectorEntry([...object.destination, 0, ...object.heading, 0], 15));
      instance.files.set("radius", intEntry(object.radius));
      instance.files.set("triggerOnly", intEntry(1));
      teleporters.folders.set(name, instance);
    }
    instance.files.set("pos", vectorEntry([...object.position, 0], 5));
  }
  writeStartupInstances(root, "teleporter", teleporters);
  writeStartupInstances(root, "powerup", pickups);
  if (released.folders.size) writeInstances(root, "powerup", "released", released);
  return {
    teleporters: teleporters.folders.size,
    pickups: pickups.folders.size,
    released_pickups: released.folders.size,
    omitted_pickups: omittedPickups,
  };
}

export function writeStartupInstances(root: MrDirectory, className: string, startup: MrDirectory) {
  writeInstances(root, className, "startup", startup);
}

export function writeInstances(
  root: MrDirectory,
  className: string,
  name: string,
  entries: MrDirectory,
) {
  if (!entries.folders.size) return;
  const objects = root.folders.get("objects") ?? directory();
  const objectClass = objects.folders.get(className) ?? directory();
  const instances = objectClass.folders.get("instances") ?? directory();
  instances.folders.set(name, entries);
  objectClass.folders.set("instances", instances);
  objects.folders.set(className, objectClass);
  root.folders.set("objects", objects);
}
