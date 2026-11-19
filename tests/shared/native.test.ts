import { test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { $ } from "bun";

const root = resolve(import.meta.dir, "../..");
const shared = join(root, "src/shared");
const checks = join(root, "tests/shared");

for (const [name, source] of [
  ["body", "body.c"],
  ["weapon_tuning", "weapons/weapon_tuning.c"],
  ["weapon_geometry", "weapons/weapon_geometry.c"],
]) {
  test(`TM3 ${name} retains original behavior`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "tm3-shared-"));
    try {
      const executable = join(directory, "check");
      await $`cc -std=c11 -Wall -Wextra -Werror -fsanitize=undefined -I${shared}/include ${checks}/${name}.c ${shared}/${source} -o ${executable}`;
      await $`${executable}`;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("TM3 projectile guidance retains MIPS results, RNG consumption and rounding", async () => {
  const engine = await realpath(join(root, "external/rusty-metal-4"));
  const directory = await mkdtemp(join(tmpdir(), "tm3-motion-"));
  try {
    const executable = join(directory, "check");
    const gte = join(directory, "gte.o");
    const flags = [
      "-std=c11",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-fsanitize=undefined",
      "-D__psyz",
      "-DPSYZ_LOG_LEVEL=4",
      "-I.",
      "-Iexternal/psyz/psyz/include",
      `-I${shared}/include`,
      "-Ds_rsqrt_table=Tm3InverseRootTable",
    ];
    await $`cc ${flags} -Wno-unused-parameter -c external/psyz/psyz/src/psyz/libgte.c -o ${gte}`.cwd(
      engine,
    );
    await $`cc ${flags} ${checks}/projectile_motion.c ${shared}/weapons/projectile_motion.c ${shared}/weapons/projectile_visual.c ${shared}/weapons/weapon_tuning.c port/psyz/math.c external/psyz/decomp/src/libgte/msc02.c ${gte} external/psyz/psyz/src/psyz/libgte_sw_sqrt.c external/psyz/decomp/src/libgte/sqrtbl.c -o ${executable}`.cwd(
      engine,
    );
    await $`${executable}`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
