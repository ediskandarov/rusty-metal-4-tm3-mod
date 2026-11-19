import { expect, test } from "bun:test";

import { namedVab, splitVab } from "@rusty-metal-4/tm3-resources/vab";

function fixture() {
  const table = 2080 + 2 * 512;
  const bytes = new Uint8Array(table + 512 + 24);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x56414270, true);
  view.setUint32(4, 7, true);
  view.setUint32(12, bytes.length, true);
  view.setUint16(18, 2, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 2, true);
  bytes[32 + 16] = 2;
  bytes[32 + 7 * 16] = 1;
  view.setUint16(2080 + 22, 2, true);
  view.setUint16(2080 + 32 + 22, 1, true);
  view.setUint16(2592 + 22, 2, true);
  // Samples 0 and 1 deliberately have MIDI routes with different centre notes.
  bytes[2080 + 4] = 72;
  bytes[2080 + 32 + 4] = 60;
  bytes[2592 + 4] = 60;
  // Envelope bytes must survive conversion, along with the original ADPCM payload.
  bytes[2080 + 16] = 0xa9;
  bytes[2080 + 32 + 16] = 0xb7;
  bytes[2592 + 16] = 0xf1;
  view.setUint16(table + 2, 1, true);
  view.setUint16(table + 4, 2, true);
  bytes.set(
    Uint8Array.from({ length: 24 }, (_, i) => i + 1),
    table + 512,
  );
  return bytes;
}

test("TM3 sound IDs select original samples rather than MIDI programs", () => {
  const source = fixture(),
    original = source.slice();
  const banks = splitVab(source);
  expect(banks.length).toBe(2);
  expect(source).toEqual(original);
  for (const [index, bank] of banks.entries()) {
    const view = new DataView(bank.buffer);
    expect(view.getUint16(18, true)).toBe(1);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(2080 + 20, true)).toBe(0);
    expect(view.getUint16(2080 + 22, true)).toBe(1);
    expect(bank[2080 + 4]).toBe(index === 0 ? 72 : 60);
    expect(bank[2080 + 16]).toBe(index === 0 ? 0xb7 : 0xa9);
    const end = view.getUint32(12, true);
    expect([...bank.slice(3104, end)]).toEqual([
      ...(index === 0 ? original.slice(-24, -16) : original.slice(-16)),
    ]);
    expect(new TextDecoder().decode(bank.slice(end)).replace(/\0+$/g, "")).toBe(
      `tm3_s0${index}\r\n`,
    );
  }
});

test("pitch for the extra sample follows the original stride into the size table", () => {
  const original = fixture();
  const source = new Uint8Array(original.length + 8);
  source.set(original);
  const view = new DataView(source.buffer);
  view.setUint32(12, source.length, true);
  view.setUint16(22, 3, true);
  view.setUint16(2592 + 22, 3, true);
  const sizes = 2080 + 2 * 512;
  view.setUint16(sizes + 6, 1, true);
  const bank = splitVab(source)[2];
  expect(bank[2080 + 4]).toBe(source[sizes + 4]);
  expect(bank[2080 + 16]).toBe(source[2592 + 16]);
});

test("a raw sample without a MIDI route uses its ordinal tone and retains its ADPCM", () => {
  const source = fixture();
  new DataView(source.buffer).setUint16(2080 + 32 + 22, 2, true);
  const banks = splitVab(source);
  expect(banks[0][2080 + 16]).toBe(0xa9);
  expect(banks[0].slice(3104, 3112)).toEqual(source.slice(-24, -16));
  expect(banks[1]).not.toBeNull();
  const end = new DataView(banks[1].buffer).getUint32(12, true);
  expect(new TextDecoder().decode(banks[1].slice(end)).replace(/\0+$/g, "")).toBe("tm3_s01\r\n");
});

test("TM3 VAB names must describe all nonempty programs", () => {
  expect(() => namedVab(fixture(), ["only-one"])).toThrow("program/name count");
  expect(() => namedVab(new Uint8Array(4), [])).toThrow("Truncated");
});

test("TM3 VAB splitting rejects invalid program counts, sample references and truncation", () => {
  for (const corrupt of [
    (bytes) => new DataView(bytes.buffer).setUint16(18, 3, true),
    (bytes) => new DataView(bytes.buffer).setUint16(2080 + 22, 3, true),
    (bytes) => new DataView(bytes.buffer).setUint16(3104 + 4, 10, true),
    (bytes) => (bytes[32 + 16] = 17),
  ]) {
    const bytes = fixture();
    corrupt(bytes);
    expect(() => splitVab(bytes)).toThrow();
  }
  expect(() => splitVab(fixture().slice(0, 100))).toThrow();
});

const malformedBanks = [
  [
    "missing tone/sample tables",
    (bytes) => {
      const truncated = bytes.slice(0, 2080);
      new DataView(truncated.buffer).setUint32(12, truncated.length, true);
      return truncated;
    },
  ],
  [
    "sample extends past bank",
    (bytes) => {
      new DataView(bytes.buffer).setUint16(3104 + 4, 0xffff, true);
      return bytes;
    },
  ],
  [
    "tone references missing sample",
    (bytes) => {
      new DataView(bytes.buffer).setUint16(2080 + 22, 3, true);
      return bytes;
    },
  ],
  [
    "too many tones in program",
    (bytes) => {
      bytes[32 + 16] = 17;
      return bytes;
    },
  ],
  [
    "unaccounted sample bytes",
    (bytes) => {
      new DataView(bytes.buffer).setUint16(3104 + 4, 1, true);
      return bytes;
    },
  ],
];
for (const [name, corrupt] of malformedBanks) {
  test(`both VAB paths reject ${name} without changing the input`, () => {
    const bytes = corrupt(fixture()),
      before = bytes.slice();
    expect(() => namedVab(bytes, ["first", "second"])).toThrow();
    expect(() => splitVab(bytes)).toThrow();
    expect(bytes).toEqual(before);
  });
}

test("naming a valid VAB preserves all original bank bytes", () => {
  const source = fixture();
  const bank = namedVab(source, ["first", "second"]);
  expect(bank.slice(0, source.length)).toEqual(source);
  expect(new TextDecoder().decode(bank.slice(source.length)).replace(/\0+$/g, "")).toBe(
    "first\r\nsecond\r\n",
  );
});
