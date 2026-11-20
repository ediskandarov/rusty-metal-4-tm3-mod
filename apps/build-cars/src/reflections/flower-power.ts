import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-flower-power-reflections.md.
// Replacement damaged panels and all underside faces stay matte.
export const flowerPowerReflections: CarReflections = [
  new Map([
    // Subdued guns; retain their finish in both damage frames.
    ...[129, 130, 131, 132, 242, 243, 244, 245].map((face): [number, number] => [face, 4]),
    // Cream paint and floral panels, including mixed front lamp/grille faces.
    ...[
      23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
      46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 62, 63, 64, 65, 69, 70, 71, 72, 73, 74,
      75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97,
      98, 102, 103, 104, 105, 106, 107,
    ].map((face): [number, number] => [face, 24]),
    // Separate windows and grey metal bumper strips.
    ...[20, 21, 22, 59, 60, 61, 66, 67, 68, 99, 100, 101, 108, 109].map(
      (face): [number, number] => [face, 64],
    ),
  ]),
  new Map([
    // Subdued guns; retain their finish in both damage frames.
    ...[54, 55].map((face): [number, number] => [face, 4]),
    // Cream paint and floral panels, including mixed front lamp/grille faces.
    ...[
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 25, 26, 27, 28, 29, 30, 31, 32,
      33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
    ].map((face): [number, number] => [face, 24]),
    // Separate windows and grey metal bumper strips.
    ...[20, 21, 23, 24, 43, 56, 57].map((face): [number, number] => [face, 64]),
  ]),
  new Map(),
];
