import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-hammerhead-reflections.md.
export const hammerheadReflections: CarReflections = [
  new Map([
    // Replacement dark cage and bumper pieces.
    ...[
      33, 34, 35, 36, 37, 38, 45, 46, 47, 48, 49, 50, 149, 150, 151, 152, 153, 154, 161, 162, 163,
      164, 165, 166, 174, 175, 176, 177, 178, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213,
    ].map((face): [number, number] => [face, 2]),
    // Dark roll cage, windshield frame and bumpers.
    ...[
      27, 28, 29, 30, 31, 32, 39, 40, 41, 42, 43, 44, 143, 144, 145, 146, 147, 148, 155, 156, 157,
      158, 159, 160, 168, 169, 170, 171, 172, 195, 196, 197, 198, 199, 200, 201, 202, 203,
    ].map((face): [number, number] => [face, 5]),
    // Damaged replacement painted panels.
    ...[
      79, 80, 81, 83, 84, 86, 87, 88, 89, 90, 132, 133, 134, 135, 136, 138, 142, 189, 190, 193, 194,
    ].map((face): [number, number] => [face, 8]),
    // Damaged windshield.
    ...[173].map((face): [number, number] => [face, 16]),
    // Red working-truck paint and shared guns.
    ...[
      6, 7, 8, 9, 67, 68, 69, 71, 72, 74, 75, 76, 77, 78, 91, 92, 93, 94, 95, 97, 98, 101, 102, 103,
      104, 105, 106, 123, 124, 125, 126, 127, 129, 187, 188, 191, 192,
    ].map((face): [number, number] => [face, 30]),
    // Intact windshield pane, distinct from the open cage.
    ...[167].map((face): [number, number] => [face, 60]),
  ]),
  new Map([
    // Replacement dark cage and bumper pieces.
    ...[65, 66, 85, 86, 87, 88].map((face): [number, number] => [face, 2]),
    // Dark roll cage, windshield frame and bumpers.
    ...[62, 63, 80, 81, 82, 83, 84].map((face): [number, number] => [face, 5]),
    // Damaged replacement painted panels.
    ...[9, 10, 11, 12, 13, 15, 27, 28, 31, 32, 47, 48, 49, 50, 51, 53, 54, 57, 58, 59, 60].map(
      (face): [number, number] => [face, 8],
    ),
    // Damaged windshield.
    ...[64].map((face): [number, number] => [face, 16]),
    // Red working-truck paint and shared guns.
    ...[
      0, 1, 2, 3, 4, 6, 25, 26, 29, 30, 33, 34, 35, 36, 37, 39, 40, 43, 44, 45, 46, 67, 69, 70, 71,
    ].map((face): [number, number] => [face, 30]),
    // Intact windshield pane, distinct from the open cage.
    ...[61].map((face): [number, number] => [face, 60]),
  ]),
  new Map(),
];
