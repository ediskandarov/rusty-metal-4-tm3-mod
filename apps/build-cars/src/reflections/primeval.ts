import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-primeval-reflections.md.
export const primevalReflections: CarReflections = [
  new Map([
    // Damaged solid cage tubes.
    ...[
      296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 436, 437, 438, 439, 440,
      441, 450, 451, 452, 453, 454, 455, 456, 457,
    ].map((face): [number, number] => [face, 2]),
    // Damaged structural panels.
    ...[244, 245, 246, 247, 248, 249, 258, 259, 263, 264, 265].map((face): [number, number] => [
      face,
      4,
    ]),
    // Solid black cage tubes; strut-texture planes stay matte.
    ...[
      281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 430, 431, 432, 433, 434,
      435, 442, 443, 444, 445, 446, 447, 448, 449,
    ].map((face): [number, number] => [face, 5]),
    // Damaged weapon shells and engine.
    ...[
      38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
      76, 77, 78, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 127, 128, 129, 130, 131,
      132, 133, 134, 135, 136, 137, 138, 221, 222, 223, 224, 225, 295,
    ].map((face): [number, number] => [face, 8]),
    // Industrial panels and damaged silver housings.
    ...[
      190, 191, 192, 193, 194, 195, 204, 205, 206, 207, 208, 209, 226, 227, 228, 229, 230, 231, 238,
      239, 240, 241, 242, 243, 253, 254, 260, 261, 262,
    ].map((face): [number, number] => [face, 16]),
    // Weapon shells, shared barrels and engine.
    ...[
      24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
      62, 63, 64, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 112, 113, 114, 115, 116, 117, 118,
      119, 120, 121, 122, 123, 166, 167, 168, 169, 216, 217, 218, 219, 220, 280,
    ].map((face): [number, number] => [face, 30]),
    // Silver rear housings, excluding end caps.
    ...[183, 184, 185, 186, 187, 188, 197, 198, 199, 200, 201, 202].map(
      (face): [number, number] => [face, 60],
    ),
  ]),
  new Map([
    // Damaged solid cage tubes.
    ...[145, 146, 147, 148, 149, 154, 155, 159, 160, 161].map((face): [number, number] => [
      face,
      2,
    ]),
    // Damaged structural panels.
    ...[94, 95, 96, 97, 98, 99, 106, 107, 108, 109, 110, 111, 120, 121, 125, 126, 127].map(
      (face): [number, number] => [face, 4],
    ),
    // Solid black cage tubes; strut-texture planes stay matte.
    ...[139, 140, 141, 142, 143, 152, 153, 156, 157, 158].map((face): [number, number] => [
      face,
      5,
    ]),
    // Damaged weapon shells and engine.
    ...[
      27, 28, 29, 30, 31, 32, 43, 44, 45, 46, 47, 48, 83, 84, 85, 86, 87, 144, 169, 170, 171, 172,
      173, 174, 183, 184, 185, 186, 187, 188,
    ].map((face): [number, number] => [face, 8]),
    // Industrial panels and damaged silver housings.
    ...[
      64, 65, 66, 72, 73, 74, 88, 89, 90, 91, 92, 93, 100, 101, 102, 103, 104, 105, 115, 116, 122,
      123, 124,
    ].map((face): [number, number] => [face, 16]),
    // Weapon shells, shared barrels and engine.
    ...[
      16, 17, 19, 20, 21, 22, 23, 24, 35, 36, 37, 38, 39, 40, 78, 79, 80, 81, 82, 138, 162, 163,
      164, 165, 166, 167, 176, 177, 178, 179, 180, 181,
    ].map((face): [number, number] => [face, 30]),
    // Silver rear housings, excluding end caps.
    ...[60, 61, 62, 68, 69, 70].map((face): [number, number] => [face, 60]),
  ]),
  new Map(),
];
