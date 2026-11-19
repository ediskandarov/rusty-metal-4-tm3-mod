# TM3 mod

Use the PsyZ implementations and wrappers supplied by `external/rusty-metal-4`,
including GTE operations. Preserve TM3 integer semantics and operation order;
do not add replacement emulation when PsyZ already provides it.

Keep mod behavior in `src/`, resource conversion in `packages/`, and build
commands in `apps/`. Do not copy engine or SDK headers into the mod.
Keep generated archives, Wasm and disc files out of Git.
Start commit subjects with a relevant gitmoji.
