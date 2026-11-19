import { expect, test } from "bun:test";

import { readNavigation } from "../src/world/navigation.ts";

function navigation() {
  const bytes = new Uint8Array(28 + 40 + 28 + 4);
  bytes.set(new TextEncoder().encode("AI DATA\0"));
  const view = new DataView(bytes.buffer);
  view.setUint16(8, 1, true);
  view.setUint16(10, 1, true);
  view.setUint16(12, 1, true);
  bytes[68 + 8] = 1;
  return bytes;
}

test("preserves a waypoint and its outgoing link", () => {
  const bytes = navigation();
  expect(readNavigation(bytes)).toEqual({ image: bytes, areas: 1, nodes: 1, links: 1, objects: 0 });
});

test("rejects an invalid waypoint before the game loads the graph", () => {
  const bytes = navigation();
  bytes[98] = 1;
  expect(() => readNavigation(bytes)).toThrow(/index/);
  bytes[98] = 0;
  bytes[12] = 2;
  expect(() => readNavigation(bytes)).toThrow(/link count/);
});
