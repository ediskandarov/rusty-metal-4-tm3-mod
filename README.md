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

Ordinary weapon parameters and `launchFunc` bindings are stored in map MR resources.
The engine registers game defaults before world overrides, then loads individual cars.
Weapon-set callbacks only acquire and release resources around the car-class lifetime.

Map pickups keep TM3 collection rules and use TM4 rotation, bobbing, sparkle effects
and respawn timing. No custom pickup-animation hook is required.

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
Map prop behavior is bound from the instance resource and restored with its template;
callback addresses are never written into portable snapshots.
Each Wasm module exports `Tm4ModuleExport`, imports shared memory, and uses no
Asyncify. Car modules must be rebuilt against the same shared headers when
their interface changes.
`build:cars --test-hooks` enables the optional diagnostic exports.

**Loading is pending:** the current port loader expects a PS1 module descriptor
and external `/modules/*.wasm` files. It needs support for raw Wasm MR entries
before it can load this archive directly. The module itself is compiled and
checked against the engine's exports.

Execution-boundary check (requires built shared and all cars with `--test-hooks`):

```sh
bun run test:execution --disc ./disc-tm4
```

It fires all 16 specials, verifies missile ownership across Wasm modules, and
compares replay after local rollback and snapshot restore in a fresh match.
The test adapts archive packaging for the current loader without changing Wasm.

Map check (requires built shared, maps and cars with `--test-hooks`):

```sh
bun run test:maps --disc ./disc-tm4
```

Use `--map egypt`, `--map tokyo` or `--map hangar-18` for a focused run. Checks cover
map weapons, beam audio/flash, saucer destruction and replay after local rollback
and snapshot restoration in a fresh match.
