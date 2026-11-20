import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-firestarter-reflections.md.
export const firestarterReflections: CarReflections = [
  new Map([
    // Damaged paint, grille, glass and replacement engine covers.
    ...[
      7, 8, 10, 11, 66, 67, 68, 85, 90, 91, 103, 105, 106, 107, 108, 109, 111, 122, 205, 208, 209,
    ].map((face): [number, number] => [face, 2]),
    // Flame-painted panels, dark engine block and guns.
    ...[
      1, 2, 4, 5, 46, 47, 48, 49, 50, 51, 52, 62, 63, 64, 65, 78, 83, 84, 92, 94, 95, 96, 97, 98,
      99, 100, 101, 114, 115, 116, 117, 120, 206,
    ].map((face): [number, number] => [face, 30]),
    // Silver exhausts, braces and links, including bent replacements.
    ...[
      0, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
      39, 40, 41, 42, 43, 44, 45, 53, 54, 55, 56, 57, 58, 59, 61, 69, 70, 71, 72, 73, 74, 75, 77,
      113,
    ].map((face): [number, number] => [face, 60]),
    // Separate windshield; steering wheel stays matte.
    ...[202].map((face): [number, number] => [face, 64]),
  ]),
  new Map([
    // Damaged paint, grille, glass and replacement engine covers.
    ...[32, 33, 35, 36, 43, 44, 46, 56, 57, 58, 61, 62, 63, 71, 93, 94, 95, 96, 97, 98, 100].map(
      (face): [number, number] => [face, 2],
    ),
    // Flame-painted panels, dark engine block and guns.
    ...[24, 25, 26, 27, 29, 30, 38, 39, 41, 48, 49, 50, 53, 54, 55, 84, 85, 86, 87, 88, 89, 91].map(
      (face): [number, number] => [face, 30],
    ),
    // Silver exhausts, braces and links, including bent replacements.
    ...[40, 42, 45, 47, 64, 65, 66, 67].map((face): [number, number] => [face, 60]),
    // Separate windshield; steering wheel stays matte.
    ...[69].map((face): [number, number] => [face, 64]),
  ]),
  new Map(),
];
