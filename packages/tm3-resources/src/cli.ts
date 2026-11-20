import { mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import { readMr } from "@tm4/resources/compatibility/mr";

import { convertCar } from "./car/convert.ts";
import { readCar } from "./car/index.ts";
import { convertWorld } from "./world/convert.ts";
import { readWorld, validateWorldTextures } from "./world/index.ts";
import { readWorldObjects } from "./world/objects.ts";

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: true,
  allowPositionals: true,
  options: {
    output: { type: "string" },
    scale: { type: "string" },
    "texture-variant": { type: "string" },
    "tm4-game": { type: "string" },
  },
});
const command = positionals[0],
  input = positionals[1];
if (
  !command ||
  !input ||
  !["inspect-car", "convert-car", "inspect-world", "convert-world"].includes(command) ||
  positionals.length !== (command.endsWith("world") ? 3 : 2)
)
  throw Error(
    "Usage: inspect-car CAR [--output REPORT.json] | convert-car CAR --output CAR.MR [--scale 1] | inspect-world TER IMG [--output REPORT.json] | convert-world TER IMG --tm4-game GAME.MR --output MAP.MR [--texture-variant 0|1]",
  );
if (command !== "convert-car" && values.scale !== undefined)
  throw Error("--scale only applies to convert-car");
if (command !== "convert-world" && values["texture-variant"] !== undefined)
  throw Error("--texture-variant only applies to convert-world");
const bytes = new Uint8Array(await Bun.file(input).arrayBuffer());
async function writeNewFiles(files: [string, Uint8Array | string][]) {
  const created: string[] = [];
  try {
    for (const [path, data] of files) {
      await mkdir(dirname(path), { recursive: true });
      const file = await open(path, "wx");
      created.push(path);
      try {
        await file.writeFile(data);
      } finally {
        await file.close();
      }
    }
  } catch (error) {
    for (const path of created.reverse()) await unlink(path);
    throw error;
  }
}
async function hash(bytes: Uint8Array<ArrayBuffer>) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
async function report(value: unknown) {
  const json = JSON.stringify(value, null, 2) + "\n";
  if (values.output) await writeNewFiles([[resolve(values.output), json]]);
  else process.stdout.write(json);
}
if (command === "convert-world") {
  if (!values.output || !/\.mr$/i.test(values.output))
    throw Error("convert-world requires --output FILE.MR");
  const variant = values["texture-variant"];
  if (variant !== undefined && variant !== "0" && variant !== "1")
    throw Error("--texture-variant must be 0 or 1");
  const output = resolve(values.output),
    metadata = output.slice(0, -3) + ".conversion.json",
    imageOutput = output.slice(0, -3) + ".IMG";
  const image = new Uint8Array(await Bun.file(positionals[2]!).arrayBuffer());
  if (!values["tm4-game"]) throw Error("convert-world requires --tm4-game GAME.MR");
  const game = await readMr(new Uint8Array(await Bun.file(values["tm4-game"]).arrayBuffer()));
  const powerupResources = game.directories.get("Root/objects/powerup");
  if (!powerupResources) throw Error("Missing TM4 powerup resources");
  const result = await convertWorld(bytes, image, {
    powerupResources,
    ...(variant === undefined ? {} : { textureVariant: variant === "1" ? 1 : 0 }),
  });
  await writeNewFiles([
    [output, result.archive],
    [imageOutput, result.imageArchive],
    [metadata, JSON.stringify(result.metadata, null, 2) + "\n"],
  ]);
  console.log(
    `${output}: ${result.archive.length} bytes; ${result.metadata.faces} faces; ${result.metadata.collisions} collisions`,
  );
} else if (command === "inspect-world") {
  const imagePath = positionals[2];
  if (!imagePath) throw Error("Missing IMG file");
  const image = new Uint8Array(await Bun.file(imagePath).arrayBuffer());
  const world = readWorld(bytes, image),
    objectTypes: Record<number, number> = {};
  for (const object of world.terrain.objects)
    objectTypes[object.type] = (objectTypes[object.type] ?? 0) + 1;
  await report({
    ter_sha256: await hash(bytes),
    img_sha256: await hash(image),
    blocks: world.blocks.map(({ index, offset, size }) => ({
      index,
      offset,
      size,
    })),
    image_rectangles: world.vram.rectangles.map((r) => [r.x, r.y, r.width, r.height]),
    detail_groups: validateWorldTextures(world),
    object_types: objectTypes,
    pickups: readWorldObjects(world)
      .filter((object) => object.kind === "pickup")
      .map(({ offset, subtype, pickup, position, regeneration, units, destruction_group }) => ({
        offset,
        subtype,
        name: pickup?.name ?? null,
        position,
        regeneration,
        units,
        destruction_group,
      })),
    terrain: world.terrain,
  });
} else if (command === "inspect-car") {
  const { blocks, parameters, models, texture } = readCar(bytes);
  await report({
    source_sha256: await hash(bytes),
    blocks: blocks.map(({ index, offset, size }) => ({ index, offset, size })),
    parameters,
    image_rectangle: [texture.x, texture.y, texture.width, texture.height],
    models,
  });
} else {
  if (!values.output || !/\.mr$/i.test(values.output))
    throw Error("convert-car requires --output FILE.MR");
  const output = resolve(values.output),
    stem = output.slice(0, -3);
  const result = await convertCar(bytes, values.scale === undefined ? 1 : Number(values.scale));
  await writeNewFiles([
    [output, result.archive],
    [stem + ".conversion.json", JSON.stringify(result.metadata, null, 2) + "\n"],
    [stem + ".special.vab", result.specialVab],
  ]);
  console.log(
    `${output}: ${result.archive.length} bytes; ${result.metadata.validation.lods} LODs; scratch ${result.metadata.validation.maxScratchBytes}/800`,
  );
}
