# TM3 resource pack for Rusty Metal 4

[TM4 car reflections: original resources and transfer rules](docs/tm4-car-reflections.md).

Car decisions: [Sweet Tooth](docs/tm3-sweet-tooth-reflections.md), [Auger](docs/tm3-auger-reflections.md), [Axel](docs/tm3-axel-reflections.md), [Club Kid](docs/tm3-clubkid-reflections.md), [Darkside](docs/tm3-darkside-reflections.md), [Firestarter](docs/tm3-firestarter-reflections.md), [Flower Power](docs/tm3-flower-power-reflections.md), [Mr. Grimm](docs/tm3-mr-grimm-reflections.md), [Hammerhead](docs/tm3-hammerhead-reflections.md), [Minion](docs/tm3-minion-reflections.md), [Outlaw](docs/tm3-outlaw-reflections.md), [Primeval](docs/tm3-primeval-reflections.md), [Roadkill](docs/tm3-roadkill-reflections.md), [Spectre](docs/tm3-spectre-reflections.md), [Thumper](docs/tm3-thumper-reflections.md), [Warthog](docs/tm3-warthog-reflections.md).

```text
apps/wasm.ts               Common Wasm compiler invocation
apps/build-shared/          TM3.MR builder
apps/build-cars/            Car pack builder
apps/build-maps/            Map pack builder
src/shared/                Resource lifetime, snapshots and module exports
src/shared/effects/        Sprites, explosions and debris
src/shared/include/tm3/     Headers used by cars and maps
src/shared/weapons/        Common projectiles and weapon effects
src/shared/world/          Shared map objects and effects
src/cars/                  Car behavior and special tuning
src/maps/                  Map-specific weapons and object behavior
packages/                  Disc reading and resource conversion
external/rusty-metal-4/     Engine headers, PsyZ and build tools
```

Start with a car's `module.c` for registration and its special-attack entry point.
Its `projectile.c` owns missile parameters, presentation and callbacks; helpers beside
`module.c` compile into that car's Wasm. Shared owns ordinary weapons, projectile
motion, collisions and reusable effects. Outlaw and map pickups share lightning;
Firestarter and Darkside share the same flamer. Cars choose how to combine them.

Auger and Hammerhead deliberately allow other weapons during their drill/ram,
unlike TM3's selected-weapon input lock. Reactivating the same special while it
is active does not restart it or consume ammunition. Their state advances in
the ordinary TM4 car process callback, after weapon handling and physics; the
60-tick active period includes the activation tick. No pre-weapon input hook is required.

Ordinary weapons are named MR profiles selected by the map arsenal.
TM3 CAR sector weights, angles and distances are imported with weapon weights
keyed by AI category (`homing`, `special`, etc.), independently of the active
weapon implementation. TER supplies the world multipliers; selection preserves
integer normalization. Eye, Radar and Spaceship have zero weights in all original
TM3 USA v1.1 cars and remain usable by players. Their namespaced categories are
declared in the shared resource pack, with zero defaults for unfamiliar cars.
TM3 cars retain their common weapon preferences on TM4 maps too. This transfers weapon preferences,
not the full TM3 AI state machine. See the port's [weapon profile contract](external/rusty-metal-4/docs/design/weapon-profiles.md).
TM3 projectiles are bound by `prepareFunc` and `projectile`, independently of the
inventory name or position.
The engine registers game defaults before world overrides, then loads individual cars.
Weapon-set callbacks only acquire and release resources around the car-class lifetime.

Map pickups keep TM3 collection rules and use TM4 rotation, bobbing, sparkle effects
and respawn timing. TM3 regeneration value 255 disables respawn in the mod’s
collection handler. No custom pickup-animation hook is required.

Map conversion bakes TM3's ground-minus-96 spawn placement into TM4 startpoints,
including the engine's Q12 ray rounding. All 84 points on the ten shipped maps have
permanent topmost floors. Blimp's first point has destructible geometry underneath
that floor, so destroying it does not change spawn height. Conversion rejects a
point without a permanent topmost floor instead of adding a runtime placement rule.

A missile's immutable definition belongs to its module. Snapshots save its exported
name and resolve it in the loaded module on restore, including its callbacks.
Missing definitions reject the snapshot. Car-owned actors publish their snapshot
types from the car module; common actor types live in `src/shared/snapshots.c`.

Place a compatible Rusty Metal 4 checkout at `external/rusty-metal-4` and build
its diagnostic player first. Emscripten (`emcc`) must be on `PATH`.

```sh
bun install
bun run build:shared --tm3-disc ./disc-tm3 --tm4-disc ./disc-tm4
bun run build:cars --tm3-disc ./disc-tm3
bun run build:maps --tm3-disc ./disc-tm3 --tm4-disc ./disc-tm4
bun run check
bun run test
```

Each disc directory holds a CUE/BIN, CCD/IMG or a single raw data track. Use the
TM3 USA v1.1 disc. Outputs: `build/TM3.MR`, `build/cars/*.MR`, and
`build/maps/*.{MR,IMG}`. `--output` accepts a file for shared and a directory for
cars/maps. Filter builds with `--car sweet-tooth` or `--map egypt`; both flags
can be repeated. Available IDs are in `apps/build-cars/src/catalog.ts` and `apps/build-maps/src/catalog.ts`.
The MENU scene is excluded from playable maps.

For shared, cars and maps, `--game-build DIR` selects the engine build supplying
generated headers and host exports; the default is `external/rusty-metal-4/build/diagnostic`.

Shared, car and scripted map packs embed Wasm in `behavior.mod` (MR type 6).
Egypt owns Eye, Tokyo owns radar targeting and firing, and Hangar 18 owns saucer
flight, its destruction reward and Spaceship. Other maps need no separate module: their
scenery, transitions, materials and ordinary weapons use shared mechanisms.
Staged scenery destruction is owned by the shared map class in
`src/shared/world/destruction.c`. Stage geometry and released instances live in each
map MR; the engine's stock destroyable class is unchanged.
Map prop behavior is bound from the instance resource and restored with its template;
callback addresses are never written into portable snapshots.
Each Wasm module exports `Tm4ModuleExport`, imports shared memory, and uses no
Asyncify. Car modules must be rebuilt against the same shared headers when
their interface changes.
`build:cars --test-hooks` and `build:shared --test-hooks` enable diagnostic exports.

Modules carry an `rm4.module` identity and load directly from MR through the engine’s shared loader.
Before browser checks, build the engine’s MR preparation package:

```sh
bun run --cwd external/rusty-metal-4 build:mr-preparation
```

Execution-boundary check (requires built shared and all cars with `--test-hooks`):

```sh
bun run test:execution --disc ./disc-tm4
```

It fires all 16 specials, verifies missile ownership across Wasm modules, and
compares replay after local rollback and snapshot restore in a fresh match.
Tests use the built archives unchanged; stock disc modules use the engine’s MR preparation pipeline.

Map check (requires built shared, maps and cars with `--test-hooks`):

```sh
bun run test:maps --disc ./disc-tm4
```

Use `--map egypt`, `--map tokyo` or `--map hangar-18` for a focused run. Checks cover
map weapons, beam audio/flash, saucer destruction and replay after local rollback
and snapshot restoration in a fresh match.

Surface-effects check (uses the built Washington map and shared module with `--test-hooks`):

```sh
bun tests/browser/surface-effects.mjs --disc ./disc-tm4
```

Exercises marks, dust, splash and spray through the engine contact adapter, including
material changes, airborne wheels, the real teleport path, car removal and local/portable replay.

Staged destruction check (build shared with `--test-hooks`):

```sh
bun tests/browser/check_tm3_world.mjs --disc ./disc-tm4 --tm3-disc ./disc-tm3 --map london --drop-hits 3
bun tests/browser/check_tm3_world.mjs --disc ./disc-tm4 --tm3-disc ./disc-tm3 --map london --stage-prefix 1 --drop-hits 2
bun tests/browser/check_tm3_world.mjs --disc ./disc-tm4 --tm3-disc ./disc-tm3 --map london --check-transition
```

The checks cover pickup release, moving debris, and local/portable restoration
before and between destruction stages. Damage uses the engine's bullet interaction dispatch.

## TODO

- [ ] Verify every TM4 and TM3 car special, ordinary weapon and car collision against
  TM3 staged scenery and stock TM4 destroyables. Cover both `Tm3DamageScenery`
  and the engine's interaction dispatch for `tm3Destroyable`; check for direct
  `DestroyableApplyDamage` calls or class-name checks that bypass the new class.
  Verify damage, stage changes, final pickup release, local rollback and portable
  snapshot restoration. The current bullet-dispatch and focused car checks do not
  cover every special attack.

Pickup respawn check (build shared with `--test-hooks`):

```sh
bun tests/browser/pickup-respawn.mjs --disc ./disc-tm4
```

Checks one-use and respawning pickups, rollback before collection and portable
restoration after collection.
