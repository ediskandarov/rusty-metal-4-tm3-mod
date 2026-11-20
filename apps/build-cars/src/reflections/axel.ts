import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. Skin/clothing and distant geometry remain matte.
// Material reasoning and shared damage geometry: docs/tm3-axel-reflections.md.
export const axelReflections: CarReflections = [
  new Map([
    // Tyre tread, intact and damaged.
    ...[
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
      42, 43, 44, 45, 46, 47,
    ].map((face): [number, number] => [face, 4]),
    // Wheel sides and replacement damaged metal.
    ...[
      16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 48, 49, 50, 51, 52, 53, 54,
      55, 56, 57, 58, 59, 60, 61, 62, 63, 105, 106, 107, 108, 109, 110, 111, 112, 113, 115, 118,
      119, 129, 130, 131, 132, 133, 134, 135, 136, 137, 139, 148, 149, 150, 151, 152, 153, 154, 155,
      161, 162, 163, 164, 165, 178, 179,
    ].map((face): [number, number] => [face, 10]),
    // Painted frame, recesses and grille.
    ...[
      96, 97, 98, 99, 100, 102, 103, 104, 114, 116, 117, 120, 121, 122, 123, 124, 125, 126, 127,
      138, 140, 141, 142, 146, 147, 160, 170, 176, 177,
    ].map((face): [number, number] => [face, 30]),
    // Exposed plates and braces; shared records keep their finish.
    ...[101, 128, 143, 144, 145, 156, 157, 158, 166, 167, 168].map((face): [number, number] => [
      face,
      90,
    ]),
  ]),
  new Map([
    // Tyre tread, intact and damaged.
    ...[2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19].map((face): [number, number] => [
      face,
      4,
    ]),
    // Wheel sides and replacement damaged metal.
    ...[
      0, 1, 10, 11, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 92, 98, 99, 100, 101, 102,
      114, 117, 118, 120,
    ].map((face): [number, number] => [face, 10]),
    // Painted frame, recesses and grille.
    ...[66, 67, 68, 69, 70, 71, 72, 75, 76, 91, 97, 107, 113, 115, 116, 119, 121, 122].map(
      (face): [number, number] => [face, 30],
    ),
    // Exposed plates and braces; shared records keep their finish.
    ...[73, 74, 77, 93, 94, 95, 103, 104, 105].map((face): [number, number] => [face, 90]),
  ]),
  new Map(),
];
