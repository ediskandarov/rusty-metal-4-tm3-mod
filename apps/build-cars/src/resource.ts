import { convertCar, enableCarAnimations, namedVab } from "@rusty-metal-4/tm3-resources";
import { binary, directory, stringEntry } from "@tm4/resources/mods/mr-writer";

import type { CarDefinition } from "./catalog.ts";

export async function buildCarResource(definition: CarDefinition, bytes: Uint8Array<ArrayBuffer>) {
  const { root, metadata, specialVab } = await convertCar(bytes);
  if (metadata.source_sha256 !== definition.sha256 || metadata.scale !== 1)
    throw Error(`${definition.file}: expected the TM3 USA v1.1 car at scale 1`);
  if (definition.animate) enableCarAnimations(root, metadata.groups);
  if (definition.sideMounts) {
    const mounts = root.files.get("machineGuns");
    if (!mounts || mounts.type !== 26 || mounts.arraySize !== 2)
      throw Error(`${definition.file}: missing attachments 0 and 1`);
    root.files.set("tm3MissileMounts", mounts);
  }
  const mount = root.files.get("tm3SpecialMount");
  if (!mount) throw Error(`${definition.file}: missing attachment 2`);
  root.files.delete("tm3SpecialMount");
  root.files.set(definition.special, mount);
  const special = directory();
  special.files.set("name", stringEntry(definition.special));
  special.files.set("hudName", stringEntry(definition.hudName));
  const prefix = "Car" + definition.module[0]!.toUpperCase() + definition.module.slice(1);
  if (definition.prepareInput)
    special.files.set("inputFunc", stringEntry(`${prefix}PrepareWeaponInput`));
  special.files.set("launchFunc", stringEntry(`${prefix}WeaponSpecialConstructor`));
  for (const [name, value, type] of [
    ["initial", 2, 4],
    ["max", definition.maximum, 4],
    ["delay", 4096, 13],
    ["regen", definition.regeneration, 4],
    ["detonate", 0, 4],
    ["repeat", 0, 4],
  ] as const) {
    const valueBytes = new Uint8Array(4);
    new DataView(valueBytes.buffer).setInt32(0, value, true);
    special.files.set(name, { type, arraySize: 65535, bytes: valueBytes });
  }
  root.folders.set("special", special);
  if (
    definition.soundSha256 &&
    new Bun.CryptoHasher("sha256").update(specialVab).digest("hex") !== definition.soundSha256
  )
    throw Error(`${definition.file}: unexpected special sound bank`);
  root.files.set("car.vab", { ...binary(namedVab(specialVab, [definition.sound])), type: 16 });
  root.files.set("specialSoundName", stringEntry(definition.specialSound));
  const p = metadata.parameters;
  const engine = [
    p.engine_sound_id,
    p.engine_pitch_base,
    p.engine_pitch_gain,
    p.engine_volume_base,
    p.engine_volume_gain,
  ];
  if (engine.some((value) => !Number.isInteger(value)))
    throw Error(`${definition.file}: missing engine parameters`);
  const settings = new Uint8Array(20);
  engine.forEach((value, i) => new DataView(settings.buffer).setInt32(i * 4, value, true));
  root.files.set("statusEffects", stringEntry("Tm3StatusEffects"));
  root.files.set("tm3Engine", { type: 4, arraySize: engine.length, bytes: settings });
  root.files.set("engineSoundName", stringEntry(`tm3_s${String(engine[0]).padStart(2, "0")}`));
  return root;
}
