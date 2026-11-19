import { expect, test } from "bun:test";

import { Binary } from "../src/shared/binary.ts";
import { convertDestroyables } from "../src/world/destruction.ts";

function fixture() {
  const groups = new Binary(new Uint8Array(316));
  const g = groups.view;
  g.setUint8(0, 2);
  g.setInt16(8, 50, true);
  g.setUint32(68, 2, true);
  g.setUint32(72, 1, true);
  g.setUint32(76, 1, true);
  const refs = new Binary(new Uint8Array(8));
  refs.view.setUint32(0, 64, true);
  refs.view.setUint32(4, 16, true);
  const face = { command: 0x24, indices: [0, 2, 1, 255], enabled_raw: 1 };
  const terrain = {
    faces: { 16: face, 64: face },
    squares: [
      [
        { first_vertex: 12, faces: [16] },
        { first_vertex: 4, faces: [64, 16] },
      ],
    ],
    collisions: [-1, 0].map((owner) => ({
      vertices_raw: [
        [0, 0, 0, 3],
        [0, 0, 0, 0],
        [0, 0, 0, owner],
        [0, 0, 0, 0],
      ],
      edge_vectors_raw: [[0, 0, 0, 1]],
    })),
  };
  return {
    g,
    terrain,
    refs,
    run: () => convertDestroyables(terrain, groups, refs),
  };
}
test("native destruction indexes both detail levels and the converted collision polygon", () => {
  const { startup, omitted } = fixture().run();
  expect(omitted).toBe(0);
  const { files } = startup.folders.get("tm3_group_0");
  const values = (key) => [...new Uint32Array(files.get(key).bytes.buffer)];
  expect(values("hitPoints")).toEqual([50]);
  expect(values("displayFaceInfo")).toEqual([3, 1, 0, 2, 1, 16, 64, 16]);
  expect(values("displayFaceVertexInfo")).toEqual([12, 4, 4]);
  expect(values("displayVertexInfo")).toEqual([6, 3, 0, 3, 3, 96, 112, 104, 32, 48, 40]);
  expect(values("collisionPolyInfo")).toEqual([1, 80]);
  expect(values("collisionVertexInfo")).toEqual([3, 96, 104, 112]);
});
test("groups with animated transitions or no damage recipient stay static", () => {
  for (const change of [
    (f) => f.g.setUint8(16, 1),
    (f) => f.g.setUint8(0, 3),
    (f) => (f.terrain.collisions[1].vertices_raw[2][3] = -1),
  ]) {
    const f = fixture();
    change(f);
    expect(f.run().omitted).toBe(1);
  }
});
test("an invalid destruction reference cannot point outside the MR geometry", () => {
  const f = fixture();
  f.refs.view.setUint32(0, 17, true);
  expect(() => f.run()).toThrow();
  f.g.setUint32(76, 3, true);
  expect(() => f.run()).toThrow("outside world geometry");
});

test("a final stage enables replacement faces and passive colliders without assigning damage", () => {
  const f = fixture();
  f.g.setUint32(72, 0, true);
  f.g.setUint32(76, 2, true);
  f.g.setUint32(140, 1, true);
  f.g.setUint32(148, 1, true);
  const initial = f.run().startup.folders.get("tm3_group_0");
  const offsets = (node) => [...new Uint32Array(node.files.get("collisionPolyInfo").bytes.buffer)];
  expect(offsets(initial)).toEqual([1, 80]);
  expect(offsets(initial.folders.get("passive"))).toEqual([1, 0]);
  const final = initial.folders.get("next");
  expect(offsets(final)).toEqual([1, 0]);
  expect(final.files.has("displayFaceInfo")).toBe(true);
  expect(final.files.has("hitPoints")).toBe(false);
});

test("deferred destruction emits each authored face once in TER order", () => {
  const f = fixture();
  const stage = () => f.run().startup.folders.get("tm3_group_0").files;
  expect(stage().has("stageEffect")).toBe(true);
  expect(stage().has("fragmentFaces")).toBe(false);
  f.g.setUint8(12, 1);
  expect(stage).toThrow("Ambiguous destruction fragment vertex base");
  f.terrain.squares[0][0].first_vertex = 4;
  const files = stage();
  expect([...new Uint32Array(files.get("stageId").bytes.buffer)]).toEqual([0, 0]);
  expect([...new Uint32Array(files.get("fragmentFaces").bytes.buffer)]).toEqual([2, 64, 4, 16, 4]);
});
