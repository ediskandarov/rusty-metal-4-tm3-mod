import { test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { $ } from "bun";

test("Sweet Tooth retains integer animation, launch and flight rules", async () => {
  const root = resolve(import.meta.dir, "../..");
  const directory = await mkdtemp(join(tmpdir(), "tm3-sweet-"));
  try {
    const executable = join(directory, "check");
    await $`cc -std=c11 -Wall -Wextra -Werror -fsanitize=undefined -Isrc/shared/include tests/cars/sweet.c src/cars/sweet-tooth/special.c src/shared/body.c -o ${executable}`.cwd(
      root,
    );
    await $`${executable}`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
