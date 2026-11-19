import { at, requireValue } from "../shared/binary.ts";
import type { TextureRectangle } from "../shared/texture.ts";
import type { CarModel } from "./model.ts";

type Point = { x: number; z: number };
const size = 32;
const samples = size * 2;
// Leave two texels for the penumbra inside TM4's fixed ground quad.
const inset = 4;
const maxShade = 10;

function edge(a: Point, b: Point, x: number, z: number) {
  return (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
}

function triangle(mask: Uint8Array, a: Point, b: Point, c: Point) {
  const sign = Math.sign(edge(a, b, c.x, c.z));
  if (!sign) return;
  for (let y = Math.floor(Math.min(a.z, b.z, c.z)); y < Math.max(a.z, b.z, c.z); y++) {
    for (let x = Math.floor(Math.min(a.x, b.x, c.x)); x < Math.max(a.x, b.x, c.x); x++) {
      const u = x + 0.5,
        v = y + 0.5;
      if (
        sign * edge(a, b, u, v) >= 0 &&
        sign * edge(b, c, u, v) >= 0 &&
        sign * edge(c, a, u, v) >= 0
      )
        mask[y * samples + x] = 1;
    }
  }
}

// CarShadowDisplay maps UV (0,0) to the collision corner (min X, max Z).
function silhouette(model: CarModel) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  const groups = model.groups.map((group) => {
    const [, , start, count] = at(group.frames, 0);
    return model.vertices.slice(start, start + count).map((vertex) => {
      // Include the right-wheel half-turn used by the original car renderer.
      const direction = group.transform_slot === 1 || group.transform_slot === 3 ? -1 : 1;
      const x = direction * at(vertex, 0) + (group.flag ? at(group.center, 0) : 0);
      const z = direction * at(vertex, 2) + (group.flag ? at(group.center, 2) : 0);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      return { x, z };
    });
  });
  const mask = new Uint8Array(samples * samples);
  if (minX === maxX || minZ === maxZ) return mask;
  for (const id of new Set(model.orders.flat())) {
    const [first, count] = at(at(model.groups, id).frames, 0);
    const points = at(groups, id).map(({ x, z }) => ({
      x: inset + ((x - minX) * (samples - 2 * inset)) / (maxX - minX),
      z: inset + ((maxZ - z) * (samples - 2 * inset)) / (maxZ - minZ),
    }));
    for (const face of model.faces.slice(first, first + count)) {
      if (!face.rendered) continue;
      const [a, b, c] = face.indices.slice(0, 3).map((i) => at(points, i));
      triangle(mask, a!, b!, c!);
      if ((face.command & 0x7f) === 0x2c) triangle(mask, b!, c!, at(points, at(face.indices, 3)));
    }
  }
  return mask;
}

// A 3×3 texel box filter on the 2× silhouette. Samples outside the mask are clear.
function shadowShade(mask: Uint8Array, u: number, v: number) {
  const left = 2 * u - 2,
    top = 2 * v - 2;
  let covered = 0;
  for (let y = Math.max(0, top); y < Math.min(samples, top + 6); y++) {
    for (let x = Math.max(0, left); x < Math.min(samples, left + 6); x++) {
      covered += at(mask, y * samples + x);
    }
  }
  return Math.round((maxShade * covered) / 36);
}

// Cars occupy adjacent 192-word by 64-row VRAM slots. Even zero words can be live
// transparent texels or palette entries, including on a damaged or distant model.
function occupiedWords(texture: TextureRectangle, models: CarModel[]) {
  const { x, y, width: w } = texture;
  const used = new Uint8Array(w * 64);
  texture.words.forEach((word, i) => {
    if (word) used[i] = 1;
  });
  function reserve(left: number, right: number, top: number, bottom: number) {
    const first = Math.max(x, left) - x,
      last = Math.min(x + w - 1, right) - x;
    if (last < first) return;
    for (let row = Math.max(y, top) - y; row <= Math.min(y + 63, bottom) - y; row++)
      used.fill(1, row * w + first, row * w + last + 1);
  }
  for (const model of models) {
    const unused = new Set(model.unreferenced_faces);
    for (const [index, face] of model.faces.entries()) {
      if (!face.rendered || unused.has(index)) continue;
      const mode = (face.page >> 7) & 3,
        perWord = 4 >> mode;
      requireValue(perWord, "Reserved car texture depth");
      const uv = face.uv.slice(0, (face.command & 0x7f) === 0x24 ? 3 : 4);
      const u = uv.map((p) => at(p, 0)),
        v = uv.map((p) => at(p, 1));
      const pageX = (face.page & 15) * 64,
        pageY = ((face.page >> 4) & 1) * 256;
      reserve(
        pageX + Math.floor(Math.min(...u) / perWord),
        pageX + Math.floor(Math.max(...u) / perWord),
        pageY + Math.min(...v),
        pageY + Math.max(...v),
      );
      if (mode < 2) {
        const palette = (face.clut & 63) * 16;
        reserve(palette, palette + (mode ? 255 : 15), face.clut >> 6, face.clut >> 6);
      }
    }
  }
  return used;
}

function placement(used: Uint8Array, width: number) {
  const palettes: { col: number; row: number }[] = [];
  for (let row = 0; row < 64; row++) {
    for (let col = 0; col + 16 <= width; col += 16) {
      const start = row * width + col;
      if (!used.subarray(start, start + 16).some(Boolean)) palettes.push({ row, col });
    }
  }
  const stride = size / 4;
  for (let row = 0; row <= 64 - size; row++) {
    for (let col = 0; col <= width - stride; col++) {
      if ((col % 64) + stride > 64) continue;
      let j = 0;
      for (; j < size; j++) {
        const start = (row + j) * width + col;
        if (used.subarray(start, start + stride).some(Boolean)) break;
      }
      if (j !== size) continue;
      const palette = palettes.find(
        (p) => p.row < row || p.row >= row + size || p.col + 16 <= col || p.col >= col + stride,
      );
      if (palette) return { row, col, palette };
    }
  }
  throw Error("No unused space for a car shadow within its TM4 texture slot");
}

export function carShadow(texture: TextureRectangle, models: CarModel[]) {
  const { x, y, width: w } = texture;
  requireValue(
    x % 64 === 0 && w <= 192 && texture.height <= 64 && (y & 255) + 64 <= 256,
    "Car bitmap exceeds the TM4 texture slot",
  );
  const { row, col, palette } = placement(occupiedWords(texture, models), w);
  const height = Math.max(texture.height, palette.row + 1, row + size);
  const words = Array<number>(w * height).fill(0);
  texture.words.forEach((value, i) => {
    words[i] = value;
  });
  // CarRelocateBitStuff selects subtractive blending. The original shadow CLUTs
  // subtract up to ten 5-bit levels of grey from the ground.
  for (let shade = 1; shade <= maxShade; shade++) {
    words[palette.row * w + palette.col + shade] = 0x8000 | (shade * 0x421);
  }
  const mask = silhouette(at(models, 0));
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const dst = (row + v) * w + col + (u >> 2);
      words[dst] = at(words, dst) | (shadowShade(mask, u, v) << (4 * (u % 4)));
    }
  }
  const u = (col % 64) * 4,
    v = (y & 255) + row;
  return {
    words,
    height,
    u,
    v,
    lastU: u + size - 1,
    lastV: v + size - 1,
    clut: (x + palette.col) / 16 + (y + palette.row) * 64,
    page: Math.floor((x + col) / 64) | ((y >> 8) << 4) | (2 << 5),
  };
}
