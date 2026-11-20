import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-minion-reflections.md.
export const minionReflections: CarReflections = [
  new Map([
    // Damaged armour and lower skirt.
    ...[
      48, 49, 52, 53, 58, 59, 60, 61, 66, 67, 68, 69, 74, 75, 76, 77, 82, 83, 84, 85, 98, 99, 100,
      101, 102, 103, 104, 105, 106, 107, 108, 109, 118, 119, 120, 121, 122, 123, 124, 125, 134, 135,
      136, 137, 138, 139, 140, 141, 150, 151, 152, 153, 154, 155, 156, 157, 170, 171, 172, 173, 174,
      175, 176, 177, 178, 179, 180, 181, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215,
    ].map((face): [number, number] => [face, 2]),
    // Dirty lower exterior skirt and shelf.
    ...[46, 47, 50, 51, 54, 55, 56, 57, 62, 63, 64, 65, 70, 71, 72, 73, 78, 79, 80, 81].map(
      (face): [number, number] => [face, 4],
    ),
    // Damaged weapon receiver blocks.
    ...[232, 233, 234, 235, 236, 254, 255, 256, 257, 258].map((face): [number, number] => [
      face,
      8,
    ]),
    // Upper armour, turret and painted barrel walls.
    ...[
      86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 110, 111, 112, 113, 114, 115, 116, 117, 126,
      127, 128, 129, 130, 131, 132, 133, 142, 143, 144, 145, 146, 147, 148, 149, 158, 159, 160, 161,
      162, 163, 164, 165, 166, 167, 168, 169, 184, 185, 186, 187, 190, 191, 192, 193, 194, 195, 196,
      197, 198, 199, 200, 201, 202, 203, 204, 217, 218, 219, 220, 228, 229, 230, 231, 239, 240, 241,
      242, 250, 251, 252, 253,
    ].map((face): [number, number] => [face, 16]),
    // Dark weapon receiver blocks.
    ...[221, 222, 223, 224, 225, 243, 244, 245, 246, 247].map((face): [number, number] => [
      face,
      30,
    ]),
  ]),
  new Map([
    // Damaged armour and lower skirt.
    ...[
      6, 7, 10, 11, 13, 15, 24, 25, 26, 27, 28, 29, 30, 31, 35, 36, 37, 41, 42, 43, 47, 48, 49, 78,
      79, 80, 81, 82, 83, 84, 85, 90, 91, 92, 93,
    ].map((face): [number, number] => [face, 2]),
    // Dirty lower exterior skirt and shelf.
    ...[4, 5, 8, 9, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23].map((face): [number, number] => [
      face,
      4,
    ]),
    // Damaged weapon receiver blocks.
    ...[55, 56, 57, 58, 59, 65, 66, 67, 68, 69].map((face): [number, number] => [face, 8]),
    // Upper armour, turret and painted barrel walls.
    ...[
      32, 33, 34, 38, 39, 40, 44, 45, 46, 70, 71, 72, 73, 74, 75, 76, 77, 86, 87, 88, 89, 94, 95,
      96, 97, 98, 99, 100, 101, 102, 103,
    ].map((face): [number, number] => [face, 16]),
    // Dark weapon receiver blocks.
    ...[50, 51, 52, 53, 54, 60, 61, 62, 63, 64].map((face): [number, number] => [face, 30]),
  ]),
  new Map(),
];
