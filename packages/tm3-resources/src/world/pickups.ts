interface PickupType {
  readonly name: string;
  readonly inventorySlot: number | null;
  readonly tm4Type: string | null;
}

// Indexed by TER subtype. US v1.1 callback table 0x8007e070 selects inventory
// slots in the 20-byte weapon records at 0x8007e0f8. Subtype 16 always declines collection.
export const pickupTypes: readonly PickupType[] = [
  { name: "Health", inventorySlot: null, tm4Type: "health" },
  { name: "Fire", inventorySlot: 0, tm4Type: "fire" },
  { name: "Power", inventorySlot: 2, tm4Type: "power" },
  { name: "Homing", inventorySlot: 1, tm4Type: "homing" },
  { name: "Ricochet", inventorySlot: 6, tm4Type: "ricochet" },
  { name: "Lightning", inventorySlot: 13, tm4Type: "lightning" },
  { name: "Napalm", inventorySlot: 4, tm4Type: "napalm" },
  { name: "Remote", inventorySlot: 5, tm4Type: "remote" },
  { name: "Speed", inventorySlot: 7, tm4Type: "speed" },
  { name: "Rain", inventorySlot: 8, tm4Type: "rain" },
  { name: "Mortar", inventorySlot: 9, tm4Type: "mortar" },
  { name: "Radar", inventorySlot: 10, tm4Type: "proximity" },
  { name: "Eye", inventorySlot: 11, tm4Type: "proximity" },
  { name: "Spaceship", inventorySlot: 12, tm4Type: "proximity" },
  { name: "Turbo", inventorySlot: null, tm4Type: "turbo" },
  { name: "Full health", inventorySlot: null, tm4Type: "healthFull" },
  { name: "Inactive", inventorySlot: null, tm4Type: null },
];
