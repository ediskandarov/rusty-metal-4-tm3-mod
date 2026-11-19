# TM3 resource pack for Rusty Metal 4

```text
apps/build-shared/          TM3.MR builder
src/shared/                Shared behavior and module exports
src/shared/include/tm3/    Headers used by cars and maps
src/shared/weapons/        Projectiles and weapon effects
src/shared/world/          Shared map objects and effects
src/cars/                  Reserved for car behavior
src/maps/                  Reserved for map behavior
packages/                  Disc reading and resource conversion
external/rusty-metal-4/    Engine headers, PsyZ and build tools
```

Place a compatible Rusty Metal 4 checkout at `external/rusty-metal-4` and build
its diagnostic player first. Emscripten (`emcc`) must be on `PATH`.

```sh
bun install
bun run build:shared --tm3-disc ./disc-tm3 --tm4-disc ./disc-tm4
bun run check
bun run test
```

Each disc directory holds a CUE/BIN, CCD/IMG or a single raw data track. Use the
TM3 USA v1.1 disc. Output: `build/TM3.MR`; override it with `--output FILE`.
`--game-build DIR` selects the engine build supplying generated headers and host
exports; the default is `external/rusty-metal-4/build/diagnostic`.

`behavior.mod` contains the Wasm bytes directly (MR type 6). The module exports
`Tm4ModuleExport`, imports shared memory, and uses no Asyncify. Cars and maps must
be rebuilt against the same shared headers when their interface changes.

**Loading is pending:** the current port loader expects a PS1 module descriptor
and an external `/modules/mtm3fx.wasm`. It needs support for raw Wasm MR entries
before it can load this archive directly. The module itself is compiled and
checked against the engine's exports.
