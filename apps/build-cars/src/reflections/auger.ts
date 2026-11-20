import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Authored source-face strengths. See docs/tm3-auger-reflections.md.
export const augerReflections: CarReflections = [
  new Map([
    // r0; intact and damaged records are independently assigned.
    ...[22, 43, 54, 56, 62, 82, 115, 172, 181, 189].map((face): [number, number] => [face, 4]),
    ...[
      23, 24, 25, 31, 32, 33, 34, 35, 44, 45, 46, 47, 48, 49, 50, 51, 64, 65, 66, 67, 68, 69, 70,
      71, 72, 73, 74, 75, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 116, 117, 118, 119, 120, 121, 129,
      130, 131, 132, 133, 134, 135, 140, 141, 142, 143, 173, 174, 175, 176, 177, 182, 183, 184, 185,
      190, 191, 192, 193,
    ].map((face): [number, number] => [face, 8]),
    ...[28, 29, 38, 52, 60, 80, 81, 83, 85, 125].map((face): [number, number] => [face, 16]),
    ...[
      20, 21, 26, 27, 30, 36, 37, 39, 40, 41, 42, 53, 55, 57, 58, 59, 61, 63, 76, 77, 78, 79, 84,
      110, 111, 112, 113, 114, 127, 136, 137, 138, 139, 168, 169, 170, 171, 178, 179, 180, 186, 187,
      188,
    ].map((face): [number, number] => [face, 60]),
    ...[123, 124, 126].map((face): [number, number] => [face, 80]),
    ...[
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106,
      107, 108, 109, 122, 128, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161,
      162, 163, 164, 165, 166, 167,
    ].map((face): [number, number] => [face, 90]),
  ]),
  new Map([
    // r1; intact and damaged records are independently assigned.
    ...[45, 64, 86].map((face): [number, number] => [face, 4]),
    ...[
      23, 24, 25, 26, 27, 33, 34, 35, 36, 37, 46, 47, 48, 49, 50, 51, 52, 53, 57, 58, 59, 66, 67,
      68, 69, 70, 71, 87, 93, 94, 95, 96, 97, 99,
    ].map((face): [number, number] => [face, 8]),
    ...[30, 31, 40, 63, 65].map((face): [number, number] => [face, 16]),
    ...[20, 21, 22, 28, 29, 32, 38, 39, 41, 42, 43, 44, 54, 55, 56, 60, 61, 62, 91, 98].map(
      (face): [number, number] => [face, 60],
    ),
    ...[
      72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 88, 89, 90, 92, 100, 101, 102, 103,
      104, 105,
    ].map((face): [number, number] => [face, 90]),
  ]),
  new Map(), // r2 remains matte.
];
