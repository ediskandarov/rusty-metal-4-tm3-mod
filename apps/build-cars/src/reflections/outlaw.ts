import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-outlaw-reflections.md.
export const outlawReflections: CarReflections = [
  new Map([
    // Damaged painted body and pillars.
    ...[
      14, 15, 16, 17, 18, 19, 35, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 62, 63, 64, 65, 66,
      67, 68, 69, 70, 71, 74, 75, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
      110, 111, 112, 113, 114, 115, 145, 146, 147, 148, 149, 150, 152, 153, 154, 155, 156, 157, 158,
      159, 160, 161, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207,
    ].map((face): [number, number] => [face, 4]),
    // Damaged side guns.
    ...[139, 140, 141, 142, 143, 144, 185, 186, 187, 188, 189, 190].map(
      (face): [number, number] => [face, 8],
    ),
    // Damaged window panes.
    ...[34, 36, 72, 73, 151, 191].map((face): [number, number] => [face, 16]),
    // Black/white paint and integrated lamp housings.
    ...[
      8, 9, 10, 11, 12, 13, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 48, 49, 50, 51, 52, 53,
      54, 55, 56, 57, 60, 61, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92,
      93, 94, 95, 122, 123, 124, 125, 126, 127, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138,
      169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184,
    ].map((face): [number, number] => [face, 24]),
    // Coloured light bar, both animation sets.
    ...[
      234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252,
      253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265,
    ].map((face): [number, number] => [face, 25]),
    // Side gun bodies and crossed barrel planes.
    ...[116, 117, 118, 119, 120, 121, 162, 163, 164, 165, 166, 167].map(
      (face): [number, number] => [face, 30],
    ),
    // Window panes; white pillar triangles stay painted.
    ...[20, 22, 58, 59, 128, 168].map((face): [number, number] => [face, 64]),
  ]),
  new Map([
    // Damaged painted body and pillars.
    ...[15, 16, 19, 60, 61, 62, 63, 64, 66, 67, 86, 87, 88, 89, 90, 92, 93, 97, 99].map(
      (face): [number, number] => [face, 4],
    ),
    // Damaged window panes.
    ...[17, 65, 91, 98].map((face): [number, number] => [face, 16]),
    // Black/white paint and integrated lamp housings.
    ...[12, 13, 18, 52, 53, 54, 55, 56, 58, 59, 78, 79, 80, 81, 82, 84, 85, 94, 96].map(
      (face): [number, number] => [face, 24],
    ),
    // Coloured light bar, both animation sets.
    ...[
      20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
      43, 44, 45, 46, 47, 48, 49, 50, 51,
    ].map((face): [number, number] => [face, 25]),
    // Window panes; white pillar triangles stay painted.
    ...[14, 57, 83, 95].map((face): [number, number] => [face, 64]),
  ]),
  new Map(),
];
