import { mkdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

import { nameModule } from "@tm4/resources/mods/modules";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");

interface ModuleOptions {
  name: string;
  sources: readonly string[];
  output: string;
  defines?: string[];
  inverseRoot?: boolean;
}

export async function createModuleBuilder(gameBuild: string) {
  const engine = await realpath(join(root, "external/rusty-metal-4"));
  const build = resolve(gameBuild);
  const includes = join(build, "CMakeFiles/tm4_core.dir/includes_C.rsp");
  if (!(await Bun.file(includes).exists()))
    throw Error(`Build the Rusty Metal 4 player first: missing ${includes}`);
  const compiler = Bun.which("emcc");
  if (!compiler) throw Error("Emscripten emcc is not on PATH");
  const main = await WebAssembly.compile(
    await Bun.file(join(build, "site/tm4_web.wasm")).arrayBuffer(),
  );
  const hostExports = new Set(WebAssembly.Module.exports(main).map(({ name }) => name));
  const shared = join(root, "src/shared");
  const flags = [
    "-O2",
    "-fPIC",
    "-fwrapv",
    "-fno-strict-aliasing",
    "-funsigned-char",
    "-fvisibility=hidden",
    "-pthread",
    "-sSIDE_MODULE=2",
    "-sASYNCIFY=0",
    "-sEXPORTED_FUNCTIONS=_Tm4ModuleExport",
    "-DPLATFORM_WEB=1",
    "-D__psyz",
    "-DSquareRoot0=__wrap_SquareRoot0",
    "-include",
    "port/psyz/sdk.h",
    `@${includes}`,
    "-Iport/web",
    "-I.",
    `-I${shared}`,
    `-I${shared}/include`,
    `-I${shared}/weapons`,
    `-I${shared}/world`,
    "-Wno-nonportable-include-path",
  ];
  return async ({
    name,
    sources: inputSources,
    output,
    defines = [],
    inverseRoot = false,
  }: ModuleOptions) => {
    const sources = inputSources.map((file) => resolve(file));
    if (!sources.length) throw Error(`${name}: no C sources`);
    const destination = join(resolve(output), `${name}.wasm`);
    await mkdir(resolve(output), { recursive: true });
    if (inverseRoot) {
      const table = join(resolve(output), "inverse-root.o");
      // TM3 uses the SDK table with its own normalization sequence. Keep its private
      // name so the mod does not interpose the engine's GTE data symbol.
      const result =
        await $`${compiler} -O2 -fPIC -pthread -Ds_rsqrt_table=Tm3InverseRootTable -DD_800BCF08=Tm3UnusedInverseRootPrefix -Iexternal/psyz/psyz/include -c external/psyz/decomp/src/libgte/msc02.c -o ${table}`
          .cwd(engine)
          .nothrow();
      if (result.exitCode) throw Error(`SDK table compilation failed (${result.exitCode})`);
      sources.push(table);
    }
    const definitions = defines.map((value) => `-D${value}`);
    const result = await $`${compiler} ${sources} ${flags} ${definitions} -o ${destination}`
      .cwd(engine)
      .nothrow();
    if (result.exitCode) throw Error(`${name}: compilation failed (${result.exitCode})`);
    const bytes = nameModule(
      new Uint8Array(await Bun.file(destination).arrayBuffer()),
      `${name}.sym`,
    );
    await Bun.write(destination, bytes);
    const module = await WebAssembly.compile(bytes);
    const imports = WebAssembly.Module.imports(module);
    const exports = WebAssembly.Module.exports(module);
    if ([...imports, ...exports].some(({ name }) => /asyncify/i.test(name)))
      throw Error(`${name}: resource modules must not suspend`);
    if (!exports.some(({ name, kind }) => name === "Tm4ModuleExport" && kind === "function"))
      throw Error(`${name}: missing Tm4ModuleExport`);
    if (!WebAssembly.Module.customSections(module, "dylink.0").length)
      throw Error(`${name}: not an Emscripten side module`);
    const missing = imports.filter(
      ({ module, name, kind }) =>
        kind === "function" && module === "env" && name !== "abort" && !hostExports.has(name),
    );
    if (missing.length)
      throw Error(
        `${name}: game ABI does not export ${missing.map(({ name }) => name).join(", ")}`,
      );
    return bytes;
  };
}
