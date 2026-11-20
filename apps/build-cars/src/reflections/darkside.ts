import type { CarReflections } from "@rusty-metal-4/tm3-resources";

// Source CAR face indices. See docs/tm3-darkside-reflections.md.
export const darksideReflections: CarReflections = [
  new Map([
    // Damaged replacement panels and glass.
    ...[
      56, 57, 58, 59, 60, 61, 62, 63, 70, 71, 72, 73, 74, 75, 98, 119, 120, 121, 122, 123, 124, 125,
      126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 169, 170, 171, 172, 173, 174,
      181, 182, 183, 184, 185, 186, 196, 197, 198, 199, 200, 201, 202, 203, 204, 207, 208, 211, 212,
    ].map((face): [number, number] => [face, 2]),
    // Lower chassis, steps and fenders.
    ...[
      64, 65, 66, 67, 68, 69, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 163, 164,
      165, 166, 167, 168, 175, 176, 177, 178, 179, 180,
    ].map((face): [number, number] => [face, 10]),
    // Black body, hood and high aerodynamic fairing.
    ...[
      97, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116,
      117, 118, 187, 188, 189, 190, 191, 192, 193, 195, 205, 206, 209, 210, 217, 219, 220, 222, 223,
      224, 225,
    ].map((face): [number, number] => [face, 20]),
    // Front assembly, tanks and bronze guns.
    ...[41, 42, 43, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 213, 214, 215, 216].map(
      (face): [number, number] => [face, 30],
    ),
    // Vertical exhausts; bent silver replacements retain the finish.
    ...[76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90].map(
      (face): [number, number] => [face, 60],
    ),
    // Actual lower cab windows, not the upper fairing.
    ...[194, 218, 221].map((face): [number, number] => [face, 64]),
  ]),
  new Map([
    // Damaged replacement panels and glass.
    ...[
      52, 53, 54, 55, 56, 57, 58, 59, 66, 67, 68, 69, 70, 71, 100, 108, 109, 110, 111, 112, 113,
      114, 138, 139, 140, 141, 142, 148, 149, 150, 151, 152, 167, 168, 169, 170, 171, 172, 173, 174,
      175, 176, 177, 178, 179, 180, 183, 184, 187, 188,
    ].map((face): [number, number] => [face, 2]),
    // Lower chassis, steps and fenders.
    ...[
      60, 61, 62, 63, 64, 65, 115, 116, 117, 118, 119, 120, 121, 122, 123, 133, 134, 135, 136, 137,
      143, 144, 145, 146, 147,
    ].map((face): [number, number] => [face, 10]),
    // Black body, hood and high aerodynamic fairing.
    ...[
      99, 101, 102, 103, 104, 105, 106, 107, 153, 154, 155, 156, 157, 158, 159, 160, 163, 165, 166,
      181, 182, 185, 186,
    ].map((face): [number, number] => [face, 20]),
    // Front assembly, tanks and bronze guns.
    ...[42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 73, 74, 75, 77, 78, 79, 81, 82, 83, 85, 86, 87].map(
      (face): [number, number] => [face, 30],
    ),
    // Vertical exhausts; bent silver replacements retain the finish.
    ...[88, 89, 90, 91, 92].map((face): [number, number] => [face, 60]),
    // Actual lower cab windows, not the upper fairing.
    ...[161, 162, 164].map((face): [number, number] => [face, 64]),
  ]),
  new Map(),
];
