import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-roadkill-reflections.md.
export const roadkillReflections: CarReflections = [
  new Map([
    // Damaged patched body and intake shells.
    ...[
      66, 67, 68, 69, 76, 77, 78, 79, 80, 81, 89, 92, 96, 97, 98, 99, 112, 113, 114, 115, 116, 117,
      118, 119, 120, 122, 129, 130, 131, 132, 133, 134, 148, 150, 151, 152, 153, 154, 155, 156, 157,
      158, 165, 168, 169, 170, 177, 178, 180, 182, 201, 202,
    ].map((face): [number, number] => [face, 4]),
    // Damaged windows and guard.
    ...[88, 90, 91, 93, 121, 147, 190, 192, 193, 194, 195, 196, 205].map(
      (face): [number, number] => [face, 8],
    ),
    // Worn body and solid intake panels.
    ...[
      62, 63, 64, 65, 70, 71, 72, 73, 74, 75, 83, 86, 94, 95, 100, 101, 102, 103, 104, 105, 106,
      107, 108, 110, 124, 125, 126, 127, 128, 136, 138, 139, 140, 141, 142, 143, 144, 145, 146, 159,
      162, 163, 164, 171, 172, 174, 176, 197, 198,
    ].map((face): [number, number] => [face, 16]),
    // Shared guns and working-metal strips.
    ...[24, 25, 28, 29, 31, 32, 35, 36, 183, 200].map((face): [number, number] => [face, 30]),
    // Main window panes.
    ...[82, 84, 85, 87, 109, 135].map((face): [number, number] => [face, 40]),
    // Separate front guard side plates.
    ...[185, 186, 187, 188, 189].map((face): [number, number] => [face, 60]),
  ]),
  new Map([
    // Damaged patched body and intake shells.
    ...[
      13, 16, 18, 20, 21, 22, 23, 24, 25, 39, 42, 44, 46, 47, 48, 49, 50, 51, 67, 68, 69, 70, 72,
      73, 74, 75, 76, 77, 79, 80,
    ].map((face): [number, number] => [face, 4]),
    // Damaged windows and guard.
    ...[14, 19, 40, 45, 71, 78].map((face): [number, number] => [face, 8]),
    // Worn body and solid intake panels.
    ...[
      0, 3, 5, 7, 8, 9, 10, 11, 12, 26, 29, 31, 33, 34, 35, 36, 37, 38, 52, 53, 54, 55, 57, 58, 59,
      60, 61, 62, 64, 65,
    ].map((face): [number, number] => [face, 16]),
    // Main window panes.
    ...[1, 6, 27, 32, 56, 63].map((face): [number, number] => [face, 40]),
  ]),
  new Map(),
];
