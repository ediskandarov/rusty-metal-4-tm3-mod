# TM3 resource pack for Rusty Metal 4

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
packages/                  Disc reading and resource conversion
external/rusty-metal-4/     Engine headers, PsyZ and build tools
```

Start with a car's `module.c` for registration and its special-attack entry point.
Its `projectile.c` owns missile parameters, presentation and callbacks; helpers beside
`module.c` compile into that car's Wasm. Shared owns ordinary weapons, projectile
motion, collisions and reusable effects. Outlaw and map pickups share lightning;
Firestarter and Darkside share the same flamer. Cars choose how to combine them.

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
bun run build:maps --tm3-disc ./disc-tm3
bun run check
bun run test
```

Each disc directory holds a CUE/BIN, CCD/IMG or a single raw data track. Use the
TM3 USA v1.1 disc. Outputs: `build/TM3.MR`, `build/cars/*.MR`, and
`build/maps/*.{MR,IMG}`. `--output` accepts a file for shared and a directory for
cars/maps. Filter builds with `--car sweet-tooth` or `--map egypt`; both flags
can be repeated. Available IDs are in `apps/build-cars/src/catalog.ts` and `apps/build-maps/src/catalog.ts`.
The MENU scene is excluded from playable maps.

For shared and cars, `--game-build DIR` selects the engine build supplying
generated headers and host exports; the default is `external/rusty-metal-4/build/diagnostic`.

Shared and car packs contain Wasm bytes directly in `behavior.mod` (MR type 6).
Map packs refer to the shared module's object and effect handlers.
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
