import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-clubkid-reflections.md.
export const clubKidReflections: CarReflections = [
  new Map([
    // Damaged shell, shattered glass and lower structure.
    ...[
      63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85,
      86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 97, 117, 118, 120, 121, 122, 123, 124, 125, 126, 127,
      128, 129, 130, 131, 132, 133, 134, 135, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192,
      193, 194, 195, 196, 197, 198, 199, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212,
      213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 232, 233, 234, 235,
      241, 242, 243, 244, 245,
    ].map((face): [number, number] => [face, 4]),
    // Lower painted crossmembers.
    ...[228, 229, 230, 231, 236, 237, 238, 239, 240].map((face): [number, number] => [face, 16]),
    // Graphic-covered paint and clean shared guns.
    ...[
      0, 1, 2, 3, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47,
      48, 49, 50, 51, 52, 53, 55, 56, 57, 58, 60, 62, 98, 99, 101, 102, 103, 104, 106, 107, 108,
      109, 110, 112, 113, 114, 116, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148,
      149, 150, 151, 152, 153, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168,
      169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181,
    ].map((face): [number, number] => [face, 48]),
    // Metal bumpers, including bent replacement geometry.
    ...[
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    ].map((face): [number, number] => [face, 60]),
    // Separate glass faces.
    ...[54, 59, 105, 111, 115].map((face): [number, number] => [face, 64]),
  ]),
  new Map([
    // Damaged shell, shattered glass and lower structure.
    ...[
      22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 39, 40, 41, 50, 51, 52, 53, 55, 56,
      57, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 93, 94, 95,
    ].map((face): [number, number] => [face, 4]),
    // Lower painted crossmembers.
    ...[36, 37, 38, 90, 91, 92].map((face): [number, number] => [face, 16]),
    // Graphic-covered paint and clean shared guns.
    ...[
      4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 42, 43, 44, 47, 48, 58, 59, 60, 61,
      62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 73,
    ].map((face): [number, number] => [face, 48]),
    // Metal bumpers, including bent replacement geometry.
    ...[6, 7, 96, 97].map((face): [number, number] => [face, 60]),
    // Separate glass faces.
    ...[19, 45, 49, 72].map((face): [number, number] => [face, 64]),
  ]),
  new Map(),
];
