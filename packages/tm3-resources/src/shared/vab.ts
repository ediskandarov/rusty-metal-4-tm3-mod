import { at } from "./binary.ts";

const toneTable = 32 + 128 * 16;
const toneGroupSize = 16 * 32;

/** Keep original ADPCM/tone/envelope bytes; add the names consumed by TM4's bank loader. */
export function namedVab(source: Uint8Array<ArrayBuffer>, names: string[]) {
  const { programCount } = readVab(source);
  if (programCount !== names.length) throw Error("VAB program/name count mismatch");
  const suffix = new TextEncoder().encode(names.join("\r\n") + "\r\n");
  const bytes = new Uint8Array(Math.ceil((source.length + suffix.length) / 4) * 4);
  bytes.set(source);
  bytes.set(suffix, source.length);
  return bytes;
}
/** Validate the complete bank before it can reach the native sound loader. */
export function readVab(source: Uint8Array) {
  if (source.length < 2080) throw Error("Truncated VAB header/programs");
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (
    view.getUint32(0, true) !== 0x56414270 ||
    view.getUint32(4, true) !== 7 ||
    view.getUint32(12, true) !== source.length
  )
    throw Error("Invalid source VAB");
  const count = view.getUint16(18, true),
    sampleCount = view.getUint16(22, true);
  if (count < 1 || count > 128 || sampleCount > 255) throw Error("Invalid VAB counts");
  const table = toneTable + count * toneGroupSize;
  if (table + 512 > source.length) throw Error("Truncated VAB tone/sample tables");
  const active = Array.from({ length: 128 }, (_, i) => at(source, 32 + i * 16)).filter(Boolean);
  if (active.length !== count || active.some((n) => n > 16))
    throw Error("Invalid VAB program tones");
  const samples: { offset: number; size: number }[] = [];
  let cursor = table + 512;
  for (let i = 0; i < sampleCount; ++i) {
    const size = view.getUint16(table + (i + 1) * 2, true) * 8;
    if (cursor + size > source.length) throw Error("Truncated VAB sample");
    samples.push({ offset: cursor, size });
    cursor += size;
  }
  if (cursor !== source.length) throw Error("VAB sample extents disagree with file size");
  const bindings = new Map<
    number,
    {
      program: number;
      offset: number;
    }
  >();
  const rawTones: { program: number; offset: number }[] = [];
  for (let program = 0, group = 0; program < 128; ++program) {
    const toneCount = at(source, 32 + program * 16);
    if (!toneCount) continue;
    rawTones.push({ program, offset: toneTable + group * toneGroupSize });
    for (let i = 0; i < toneCount; ++i) {
      const offset = toneTable + group * toneGroupSize + i * 32;
      const index = view.getUint16(offset + 22, true) - 1;
      if (index < 0 || index >= samples.length) throw Error("VAB tone sample outside table");
      if (!bindings.has(index)) bindings.set(index, { program, offset });
    }
    ++group;
  }
  return { programCount: count, samples, bindings, rawTones };
}

/** TM3 SoundLoadVab (800409d4) registers raw samples in order, ignoring MIDI program routing. */
export function splitVab(source: Uint8Array<ArrayBuffer>) {
  const { samples, bindings, rawTones } = readVab(source);
  return samples.map(({ offset, size }, index) => {
    // Effects such as Minion's freeze sound have no MIDI route to their ADPCM.
    const binding = bindings.get(index) ?? rawTones[index];
    if (!binding) return null;
    const sample = source.subarray(offset, offset + size);
    const data = 32 + 128 * 16 + 512 + 512;
    const bank = new Uint8Array(data + sample.length);
    const output = new DataView(bank.buffer);
    bank.set(source.subarray(0, 32));
    output.setUint32(12, bank.length, true);
    output.setUint16(18, 1, true);
    output.setUint16(20, 1, true);
    output.setUint16(22, 1, true);
    bank.set(source.subarray(32 + binding.program * 16, 48 + binding.program * 16), 32);
    bank[32] = 1;
    bank.set(source.subarray(binding.offset, binding.offset + 32), toneTable);
    // SoundLoadVab (80040ad4) takes the pitch byte at this stride for each sample.
    // The last sample in TM3.VAB reaches the size table immediately after the tone groups.
    if (index <= rawTones.length)
      bank[toneTable + 4] = at(source, toneTable + index * toneGroupSize + 4);
    output.setUint16(2080 + 20, 0, true);
    output.setUint16(2080 + 22, 1, true);
    output.setUint16(2592 + 2, sample.length / 8, true);
    bank.set(sample, data);
    return namedVab(bank, [`tm3_s${String(index).padStart(2, "0")}`]);
  });
}
