# TM3 resource pack for Rusty Metal 4

Place a Rusty Metal 4 checkout at `external/rusty-metal-4`, then run:

```sh
bun install
bun run build:shared --tm3-disc ./disc-tm3 --tm4-disc ./disc-tm4
```

Each directory holds one disc image (CUE/BIN, CCD/IMG or a single raw data track).
Use the TM3 USA v1.1 disc. The shared archive is written to `build/TM3.MR`.
Use `--output FILE` to choose another location.
