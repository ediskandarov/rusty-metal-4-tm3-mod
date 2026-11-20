# @rusty-metal-4/tm3-resources

Convert Twisted Metal III car and map resources from the US v1.1 disc to TM4 archives.

## Usage

From the repository root:

```sh
bun packages/tm3-resources/src/cli.ts convert-car 'SWEET.CAR;1' --output build/tm3/SWEET.MR
bun packages/tm3-resources/src/cli.ts convert-world 'HOLLYWD.TER;1' 'HOLLYWD.IMG;1' --tm4-game ./GAME.MR --output build/tm3/HOLLYWD.MR
```

Use `inspect-car` or `inspect-world` with the same input files to print a JSON report.

`convert-world` exports resources. Use `bun run build:maps --tm3-disc ./disc-tm3 --tm4-disc ./disc-tm4`
from the mod root to attach map-specific Wasm and bind moving-object behavior.
Maps also need the shared TM3 module and the port's world texture bank. The map
weapon set applies to stock TM4 cars too.

## GAP

- **Car appearance.** Corner normals average incident face directions within 75° across stationary body panels. Each moving part, damage state and LOD is processed separately. The ground shadow follows the intact model in its rest pose. Original face tints are lost. Custom parts stay in their rest pose until a behavior module animates them.
- **Driving and weapons.** TM4 supplies its own physics and AI defaults. The physics box keeps its dimensions but can shift relative to the original. Weapon mounts use the original positions and an assumed forward direction.
- **Car behavior and audio.** Special attacks, engine sounds and character registration require a separate mod. The original sound bank is exported alongside the car. When splitting it for TM4, samples without a known tone remain unavailable. Six ranges in the car parameter block (54 bytes) have unknown gameplay meaning, including the three values at `0x60/62/64`. The reader preserves these bytes and the four-byte zero trailer.
- **Map gameplay.** Type-11 decorations retain their original texture, tint, dimensions and blend mode. Spinning billboards use the game clock for their phase. The native AI reads the TM3 navigation graph. Stage transitions update the original object’s blocked edges and waypoints. Type-23 props retain their original mesh and motion. Hangar 18’s flying saucer can be shot down. Tokyo’s radar tracks a target designated by the car carrying Radar. TM4 supplies AI decision logic and difficulty interpolation. Original map ambience remains open.
- **Map materials.** Terrain faces used by the near geometry use texture variant 0, including faces shared with the far geometry. Far-only faces use variant 1. `--texture-variant 0|1` forces one variant for comparison. Original TM3 selects per terrain cell relative to each camera. With squared horizontal distance measured in grid cells, the variant switches to 1 at 16, back to 0 at 49 and to 1 again at 100. Wheel effects use the map’s UV rectangles, palettes, blend flags and wheel contact points. On a converted map, contact speed controls the collision sound. Two wheels compressing by at least 24 units trigger the original landing sample.

### Surface friction

All 63 default friction coefficients match between TM3 US v1.1 and TM4. These cover static and kinetic friction for the front wheels, rear wheels and body, plus viscous drag, for each of the nine surface kinds. TM3 initializes these tables in `SCUS_942.49` at `0x8001E598–0x8001E6F0`. TM4 loads them from `GAME.MR` under `/objects/car/physics/FRIC_*`. All 3,506 collision polygons across the 11 converted maps retain their material index and surface kind.

The car converter applies TM3's friction adjustment (CAR offset `0x40`) to both axles. Handbraking still differs. TM3 applies rear-wheel braking without an extra surface-friction multiplier. TM4 also scales rear-wheel grip by `frictionEbrakeScale`, which defaults to 0.75 for converted cars.

### Destructible scenery

Across 11 US v1.1 map resources, 81 of 87 groups convert to damageable scenery. Each stage uses its own damage threshold, visible faces at both detail levels, and collision polygons. A polygon that blocks the car without receiving damage keeps that distinction. Reaching the last stage reveals linked pickups at their original positions. Deferred stages keep their display faces for one more tick. Each authored fragment uses the stage's texture, vertex centroid and randomized launch velocity; its flight uses TM4 fragment physics. Impact sprites and sounds use TM3’s surface table.

London’s animated structure uses its separate 51-face mesh and the movement parameters of its last damageable stage. Five single-stage Warehouse groups and one London group without damage-receiving geometry remain static.

### Map pickups and weapons

All 281 item placements convert, including 32 items revealed by destruction.

Items on the ground use the original block-5 meshes and vertex colours in a standard TM4 `power.bin`. TM4 computes their normals and supplies lighting, rotation, bobbing and sparkle effects. Models with no TM3 replacement, including the special-weapon HUD icon, come from TM4 GAME.MR. TM3 pickup rules supply the interaction radius, sound, ammo limits and healing percentages. Health pickups use the map’s separate health regeneration rate.

The shared module handles Fire, Homing, Power, Speed, Napalm and Mortar. Ricochet reflects off the surface normal. Rain splits into six projectiles. Remote detonates on the second press. Lightning and Spaceship use emitters placed by the map. Tokyo fires its radar beam from the dish. In Egypt the first press drops the Eye marker and the second fires at it. Each map-specific weapon uses the spare Proximity inventory slot.

Weapon selection and the HUD use TM4. Eye and Radar use two voices from the original sound bank and fade the map’s flash colour by 12 per tick. Rain, Napalm and the map beam leave animated ground fire on impact. Tyre marks, spray, splashes and dust use the map’s material records. Verification covers gameplay, effect state and replay in the port. Frame-by-frame video and mixed audio have yet to be compared with a recording of the original game.
