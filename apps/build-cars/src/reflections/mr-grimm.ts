import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-mr-grimm-reflections.md.
// The rider, saddle and mixed clothing faces remain matte.
export const mrGrimmReflections: CarReflections = [
  new Map([
    // Damaged red panels and mixed engine faces.
    ...[
      42, 43, 68, 69, 70, 71, 72, 73, 74, 75, 76, 78, 79, 80, 82, 83, 84, 85, 86, 87, 88, 89, 90,
      91, 198, 199, 200, 201, 202, 203, 204, 208, 209, 210, 211, 212, 214, 215, 216, 217, 218, 219,
      221, 222, 223, 224, 225, 250, 256,
    ].map((face): [number, number] => [face, 4]),
    // Dull replacement fork and broken headlamp assembly.
    ...[17, 18, 19, 20, 21, 22, 23, 32, 33, 34, 35, 37, 38, 39].map((face): [number, number] => [
      face,
      16,
    ]),
    // Red lacquer, mixed mechanical faces and sidecar gun.
    ...[
      40, 41, 44, 45, 46, 47, 48, 49, 50, 51, 52, 54, 55, 56, 58, 59, 60, 61, 62, 63, 64, 65, 66,
      67, 160, 161, 162, 163, 165, 166, 167, 168, 170, 171, 172, 173, 174, 175, 176, 180, 181, 182,
      183, 184, 186, 187, 188, 189, 190, 191, 193, 194, 195, 196, 197, 239, 245,
    ].map((face): [number, number] => [face, 30]),
    // Silver fork, headlamp assembly and exhaust; bent exhaust stays metal.
    ...[10, 11, 12, 13, 14, 15, 16, 24, 25, 26, 27, 29, 30, 31, 93, 94, 96, 97].map(
      (face): [number, number] => [face, 60],
    ),
  ]),
  new Map([
    // Damaged red panels and mixed engine faces.
    ...[30, 32, 35, 36, 37, 38, 39, 40, 41, 42, 46, 73, 74, 75, 76, 77, 78, 84].map(
      (face): [number, number] => [face, 4],
    ),
    // Dull replacement fork and broken headlamp assembly.
    ...[52, 53, 54, 61, 62, 64, 65, 66].map((face): [number, number] => [face, 16]),
    // Red lacquer, mixed mechanical faces and sidecar gun.
    ...[
      17, 19, 22, 23, 24, 25, 26, 27, 28, 29, 43, 67, 68, 69, 70, 71, 72, 81, 113, 114, 115, 116,
    ].map((face): [number, number] => [face, 30]),
    // Silver fork, headlamp assembly and exhaust; bent exhaust stays metal.
    ...[49, 50, 51, 55, 56, 58, 59, 60, 117].map((face): [number, number] => [face, 60]),
  ]),
  new Map(),
];
