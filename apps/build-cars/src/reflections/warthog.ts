import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-warthog-reflections.md.
export const warthogReflections: CarReflections = [
  new Map([
    // Damaged camouflage, glazing and working metal.
    ...[
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 60,
      61, 63, 70, 71, 73, 80, 81, 83, 110, 111, 112, 113, 115, 116, 117, 134, 135, 136, 137, 138,
      139, 140, 141, 142, 143, 145, 146, 147, 148, 149, 155, 156, 157, 158, 159, 177, 178, 179, 180,
      181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 200, 201, 202, 203, 204, 205,
      213, 214, 216, 217, 230, 247,
    ].map((face): [number, number] => [face, 4]),
    // Dark bumpers and exposed crossmembers.
    ...[101, 102, 106, 107, 208, 211, 222, 239].map((face): [number, number] => [face, 10]),
    // Camouflaged body and box casings.
    ...[
      10, 11, 12, 13, 16, 17, 18, 19, 20, 32, 33, 34, 35, 38, 39, 40, 41, 42, 55, 56, 58, 65, 66,
      68, 75, 76, 78, 85, 86, 88, 103, 108, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 129,
      130, 150, 151, 152, 153, 154, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172,
      173, 174, 175, 176, 194, 195, 196, 197, 198, 199, 207, 210,
    ].map((face): [number, number] => [face, 20]),
    // Central gun walls in both frames.
    ...[94, 95, 97, 98].map((face): [number, number] => [face, 30]),
    // Cab panes.
    ...[14, 15, 36, 37, 131, 132, 133].map((face): [number, number] => [face, 40]),
  ]),
  new Map([
    // Damaged camouflage, glazing and working metal.
    ...[7, 8, 9, 10, 11, 12, 13, 20, 21, 22, 23, 24, 25, 32, 33, 34, 35, 36, 37, 43, 65, 73].map(
      (face): [number, number] => [face, 4],
    ),
    // Dark bumpers and exposed crossmembers.
    ...[48, 56].map((face): [number, number] => [face, 10]),
    // Camouflaged body and box casings.
    ...[0, 1, 2, 4, 5, 6, 14, 15, 16, 17, 18, 26, 27, 28, 29, 30, 38, 40, 41, 42].map(
      (face): [number, number] => [face, 20],
    ),
    // Cab panes.
    ...[3, 19, 31].map((face): [number, number] => [face, 40]),
  ]),
  new Map(),
];
