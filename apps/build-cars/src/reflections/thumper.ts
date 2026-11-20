import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-thumper-reflections.md.
export const thumperReflections: CarReflections = [
  new Map([
    // Damaged paint, windows and bright trim.
    ...[
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 34, 35, 36, 37, 48, 49, 50, 51, 52, 53, 54, 55, 56,
      57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 104, 105, 106, 107, 108, 109,
      110, 111, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158,
      159, 160, 161, 162, 163, 165, 175, 176, 177, 178, 179, 180, 181, 182, 202, 203,
    ].map((face): [number, number] => [face, 4]),
    // Grille.
    ...[100, 103].map((face): [number, number] => [face, 10]),
    // Pink paint and mixed painted panels.
    ...[
      10, 11, 12, 13, 14, 15, 30, 31, 32, 33, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92,
      93, 94, 95, 101, 102, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
      140, 141, 166, 173,
    ].map((face): [number, number] => [face, 16]),
    // Separate rear trim.
    ...[171, 172].map((face): [number, number] => [face, 50]),
    // Window panes.
    ...[16, 17, 18, 19, 76, 77, 122, 123, 190, 191].map((face): [number, number] => [face, 80]),
    // Separate bumper accents.
    ...[74, 75, 78, 79, 96, 97, 98, 99, 118, 119, 120, 121, 124, 125, 167, 168, 169, 170].map(
      (face): [number, number] => [face, 200],
    ),
  ]),
  new Map([
    // Damaged paint, windows and bright trim.
    ...[
      17, 18, 19, 20, 21, 30, 31, 41, 42, 43, 44, 45, 46, 47, 57, 58, 59, 60, 61, 62, 63, 64, 65,
      75, 76, 77, 78, 79, 80, 81, 82, 83,
    ].map((face): [number, number] => [face, 4]),
    // Grille.
    ...[39].map((face): [number, number] => [face, 10]),
    // Pink paint and mixed painted panels.
    ...[12, 13, 14, 34, 37, 38, 51, 52, 53, 54, 55, 56, 66, 67, 69, 70, 71, 74].map(
      (face): [number, number] => [face, 16],
    ),
    // Separate rear trim.
    ...[15].map((face): [number, number] => [face, 50]),
    // Window panes.
    ...[24, 25, 35, 36, 48, 49, 50, 68, 72, 73].map((face): [number, number] => [face, 80]),
    // Separate bumper accents.
    ...[16, 40].map((face): [number, number] => [face, 200]),
  ]),
  new Map(),
];
