import { at, Binary, requireValue } from "../shared/binary.ts";

// The two games unpack the same 32-bit area, link and spatial-tree records.
// Validate indices before handing the image to CarAiUnpackWorldData.
export function readNavigation(bytes: Uint8Array) {
  const data = new Binary(bytes);
  const areasCount = data.u16(8),
    nodes = data.u16(10),
    links = data.u16(12),
    objects = data.u16(14);
  requireValue(areasCount <= 10, "AI areas exceed the native world array");
  let cursor = 28;
  function take(length: number) {
    const start = cursor;
    cursor += length;
    requireValue(cursor <= bytes.length, "Truncated AI navigation stream");
    return start;
  }
  function index(value: number, count: number) {
    requireValue(value >= 0 && value < count, "AI navigation index outside its table");
  }
  const aligned = (n: number) => Math.ceil(n / 4) * 4;
  const areas = Array.from({ length: areasCount }, () => {
    const p = take(40);
    return {
      points: data.u16(p + 22),
      edges: data.u16(p + 24),
      spatial: data.u16(p + 26),
    };
  });
  for (const area of areas) {
    take(area.points * 4);
    for (let i = 0; i < area.edges; ++i) {
      const edge = take(8);
      index(data.u16(edge + 4), area.points);
      index(data.u16(edge + 6), area.points);
    }
  }
  const nodeTable = take(nodes * 28);
  let totalLinks = 0;
  for (let n = 0; n < nodes; ++n) {
    const node = nodeTable + n * 28;
    index(data.u8(node + 10), areasCount);
    const count = data.u8(node + 8);
    totalLinks += count;
    for (let j = 0; j < count; ++j) index(data.i16(take(4) + 2), nodes);
  }
  requireValue(totalLinks === links, "AI navigation link count differs from its header");
  const groups = Array.from({ length: objects }, () => {
    const p = take(36);
    return {
      states: data.u16(p + 18),
      edges: data.u16(p + 20),
      nodes: data.u16(p + 22),
    };
  });
  for (const group of groups) take(group.states * 8);
  for (const group of groups) {
    for (let e = 0; e < group.edges; ++e) {
      const edge = take(4);
      index(data.u16(edge + 2), at(areas, data.u16(edge)).edges);
    }
    const list = take(aligned(2 * group.nodes));
    for (let n = 0; n < group.nodes; ++n) index(data.u16(list + n * 2), nodes);
    take(group.states * (aligned(group.edges) + aligned(group.nodes)));
  }
  for (const area of areas) {
    const table = take(area.spatial * 28);
    for (let i = 0; i < area.spatial; ++i) {
      const node = table + i * 28;
      const parent = data.i16(node + 10),
        source = data.i16(node + 8);
      if (parent >= 0) index(parent, area.spatial);
      if (source >= 0) index(source, area.spatial);
      if (data.u8(node + 2)) {
        for (let child = 0; child < 4; ++child) {
          const id = data.u16(node + 12 + 2 * child);
          index(id, area.spatial);
          requireValue(
            data.i16(table + id * 28 + 10) === i &&
              data.u8(table + id * 28 + 3) > data.u8(node + 3),
            "AI spatial child does not descend from its parent",
          );
        }
      }
      const count = data.u8(node);
      const list = take(aligned(count * 2));
      for (let e = 0; e < count; ++e) index(data.u16(list + 2 * e), area.edges);
    }
    for (let i = 0; i < area.spatial; ++i) {
      const count = data.u8(table + i * 28 + 1);
      const list = take(aligned(count * 2));
      for (let n = 0; n < count; ++n) index(data.u16(list + 2 * n), nodes);
    }
  }
  requireValue(
    cursor === bytes.length || (cursor + 4 === bytes.length && !data.u32(cursor)),
    "Unexpected AI navigation trailer",
  );
  return {
    image: bytes.slice(0, cursor),
    areas: areas.length,
    nodes,
    links,
    objects,
  };
}
