export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

export class Binary {
  readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private field(offset: number, size: number) {
    requireValue(
      Number.isInteger(offset) && offset >= 0 && offset <= this.bytes.length - size,
      `Truncated field at 0x${offset.toString(16)}`,
    );
    return offset;
  }
  u8(offset: number) {
    return this.view.getUint8(this.field(offset, 1));
  }
  i8(offset: number) {
    return this.view.getInt8(this.field(offset, 1));
  }
  u16(offset: number) {
    return this.view.getUint16(this.field(offset, 2), true);
  }
  i16(offset: number) {
    return this.view.getInt16(this.field(offset, 2), true);
  }
  u32(offset: number) {
    return this.view.getUint32(this.field(offset, 4), true);
  }
  i32(offset: number) {
    return this.view.getInt32(this.field(offset, 4), true);
  }
  number(kind: "B" | "b" | "H" | "h" | "i", offset: number) {
    switch (kind) {
      case "B":
        return this.u8(offset);
      case "b":
        return this.i8(offset);
      case "H":
        return this.u16(offset);
      case "h":
        return this.i16(offset);
      case "i":
        return this.i32(offset);
    }
  }
  shorts(offset: number, count: number) {
    return Array.from({ length: count }, (_, i) => this.i16(offset + i * 2));
  }
  hex(start: number, end: number) {
    return [...this.bytes.slice(start, end)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
}

export function readBlocks(bytes: Uint8Array, count: number, allowEmpty = false) {
  requireValue(
    Number.isInteger(count) && count > 0 && count <= bytes.length / 4,
    "Invalid block count",
  );
  const data = new Binary(bytes);
  const offsets = [...Array.from({ length: count }, (_, i) => data.u32(i * 4)), bytes.length];
  requireValue(
    offsets[0] === count * 4 &&
      offsets.every(
        (a, i) =>
          i === count ||
          (a % 4 === 0 &&
            (allowEmpty ? a <= offsets[i + 1]! : a < offsets[i + 1]!) &&
            offsets[i + 1]! <= bytes.length),
      ),
    "Invalid resource block directory",
  );
  return offsets.slice(0, -1).map((offset, index) => ({
    index,
    offset,
    size: offsets[index + 1]! - offset,
    bytes: new Uint8Array(bytes.subarray(offset, offsets[index + 1])),
  }));
}

/** Indexed data is checked here rather than silently coercing missing values to zero. */
export function at<T extends object, K extends keyof T>(
  values: T,
  key: K,
): Exclude<T[K], undefined> {
  const value = values[key];
  requireValue(value !== undefined, `Missing index ${String(key)}`);
  return value as Exclude<T[K], undefined>;
}
