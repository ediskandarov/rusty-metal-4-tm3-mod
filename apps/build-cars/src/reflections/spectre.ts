import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-spectre-reflections.md.
export const spectreReflections: CarReflections = [
  new Map([
    // Damaged paint, including the shared damaged rear section in r1.
    ...[
      55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 68, 69, 70, 71, 72, 105, 106, 107, 108, 109,
      110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 152, 153,
      155, 157, 159, 160, 162, 164, 167, 171, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232,
      233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 265, 266, 267, 268, 269, 270, 271, 272, 273,
      274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286,
    ].map((face): [number, number] => [face, 4]),
    // Damaged glazing.
    ...[151, 154, 156, 158, 161, 163, 165, 166, 168, 169, 170, 172, 173, 174].map(
      (face): [number, number] => [face, 8],
    ),
    // Blue and white paint.
    ...[
      4, 5, 6, 16, 17, 18, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 53, 54, 83,
      84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 128,
      129, 131, 133, 135, 136, 138, 140, 143, 147, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
      211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 243, 244, 245, 246, 247, 248, 249, 250,
      251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264,
    ].map((face): [number, number] => [face, 48]),
    // Shared bright side pipes.
    ...[8, 9, 20, 21].map((face): [number, number] => [face, 60]),
    // Window panes.
    ...[127, 130, 132, 134, 137, 139, 141, 142, 144, 145, 146, 148, 149, 150].map(
      (face): [number, number] => [face, 80],
    ),
  ]),
  new Map([
    // Damaged paint, including the shared damaged rear section in r1.
    ...[
      5, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 54, 68, 69, 70, 71, 72,
      73, 74, 75, 76, 77, 83, 84, 85, 86, 87,
    ].map((face): [number, number] => [face, 4]),
    // Damaged glazing.
    ...[49, 50, 51, 52, 53, 55, 56, 57].map((face): [number, number] => [face, 8]),
    // Blue and white paint.
    ...[
      4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 58, 59, 60, 61, 62, 63,
      64, 65, 66, 67, 79, 80, 81,
    ].map((face): [number, number] => [face, 48]),
    // Window panes.
    ...[40, 41, 42, 43, 44, 46, 47, 48].map((face): [number, number] => [face, 80]),
  ]),
  new Map(),
];
