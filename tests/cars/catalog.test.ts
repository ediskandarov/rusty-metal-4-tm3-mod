import { expect, test } from "bun:test";

import { cars } from "../../apps/build-cars/src/catalog.ts";

test("special ammunition and regeneration retain the TM3 executable values", () => {
  // SCUS_942.49: 8008a850 (capacity), 8008a8c0 (Q12 seconds).
  const expected = {
    auger: [3, 45],
    axel: [5, 60],
    clubkid: [5, 50],
    darkside: [5, 60],
    firestarter: [4, 45],
    "flower-power": [5, 30],
    "mr-grimm": [3, 60],
    hammerhead: [4, 35],
    minion: [5, 30],
    outlaw: [5, 45],
    primeval: [5, 60],
    roadkill: [5, 45],
    spectre: [5, 45],
    "sweet-tooth": [5, 60],
    thumper: [4, 60],
    warthog: [5, 60],
  };
  expect(Object.fromEntries(cars.map((car) => [car.id, [car.maximum, car.regeneration]]))).toEqual(
    expected,
  );
});
