/* global Module, tm4Port */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { readMr } from "@tm4/resources/compatibility/mr";
import { discDirectorySources } from "@tm4/resources/host/disc";
import { loadDisc } from "@tm4/resources/loader/loader";
import { directory, stringEntry, writeMr } from "@tm4/resources/mods/mr-writer";

import { prepareModuleResources } from "../../../external/rusty-metal-4/packages/mr-preparation/js/host.ts";
import { launchBrowser } from "../../../external/rusty-metal-4/tests/browser/helpers/browser.mjs";

export async function openTm3Car({
  disc,
  site,
  mods,
  output,
  cars,
  world,
  playerCars,
  playerCount = 2,
  botSlots = 0,
}) {
  await mkdir(output, { recursive: true });
  const assets = await loadDisc(await discDirectorySources(resolve(disc)));
  const main = (await readMr(assets.files.get("/DATA/MAIN.MR"))).root;
  for (const config of cars) {
    const character = directory();
    character.files.set("filename", stringEntry(config.stem));
    main.folders
      .get("objects")
      .folders.get("car")
      .folders.get("characters")
      .folders.set(config.title, character);
  }
  if (world) {
    const entry = main.folders.get("worlds").folders.values().next().value;
    entry.files.set("filename", stringEntry(world.stem));
    assets.files.set(`/DATA/${world.stem.toUpperCase()}.MR`, world.archive);
    assets.files.set(`/DATA/${world.stem.toUpperCase()}.IMG`, world.imageArchive);
  }
  const pack = (
    await readMr(new Uint8Array(await Bun.file(mods + "/tm3resources/TM3.MR").arrayBuffer()))
  ).root;
  const packs = directory();
  packs.folders.set("tm3", pack);
  main.folders.set("resourcePacks", packs);
  assets.files.set("/DATA/MAIN.MR", writeMr(main));
  const tsv = new TextDecoder().decode(assets.files.get("/DATA/files.tsv"));
  const rows = tsv
    .trim()
    .split("\n")
    .map((l) => l.split("\t"));
  for (const row of rows)
    row[1] = String(assets.files.get(row[2].toUpperCase())?.length ?? +row[1]);
  let sector = Math.max(...rows.map(([l, s]) => +l + Math.ceil(+s / 2048)));
  if (world) {
    for (const extension of ["MR", "IMG"]) {
      const path = `/DATA/${world.stem.toUpperCase()}.${extension}`;
      const bytes = assets.files.get(path);
      rows.push([String(sector), String(bytes.length), path]);
      sector += Math.ceil(bytes.length / 2048);
    }
  }
  for (const config of cars) {
    const model = new Uint8Array(
      await Bun.file(`${mods}/${config.directory}/${config.file}`).arrayBuffer(),
    );
    const path = `/DATA/${config.stem.toUpperCase()}.MR`;
    assets.files.set(path, model);
    rows.push([String(sector), String(model.length), path]);
    sector += Math.ceil(model.length / 2048);
  }
  assets.files.set(
    "/DATA/files.tsv",
    new TextEncoder().encode(rows.map((r) => r.join("\t")).join("\n") + "\n"),
  );
  const modules = new Map();
  for (const path of new Bun.Glob("*.wasm").scanSync({ cwd: resolve(site, "modules") }))
    modules.set(
      path.replace(/\.wasm$/, ".sym"),
      new Uint8Array(await Bun.file(resolve(site, "modules", path)).arrayBuffer()),
    );
  await prepareModuleResources(assets.files, modules);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      const headers = {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      };
      if (path === "/favicon.ico") return new Response(null, { status: 204, headers });
      if (path === "/")
        return new Response(
          '<!doctype html><style>canvas{width:960px;height:720px}:root:fullscreen canvas{width:100vw;height:100vh}</style><canvas id="canvas" width="960" height="720"></canvas>',
          {
            headers: { ...headers, "Content-Type": "text/html" },
          },
        );
      if (path.startsWith("/assets/"))
        return new Response(assets.files.get(path.slice(7)), { headers });
      return new Response(Bun.file(site + path), { headers });
    },
  });
  console.log("SERVER", server.url.href);
  let browser;
  const log = [];
  try {
    browser = await launchBrowser({ headless: true });
    const page = await browser.newPage({ viewport: { width: 980, height: 750 } });
    await page.exposeFunction("capturePhase", async (name) => {
      await page.locator("canvas").screenshot({ path: output + "/" + name + ".png" });
    });
    page.on("console", (m) => {
      log.push(m.type() + ": " + m.text());
      if (m.type() === "error") console.error(m.text());
    });
    page.on("pageerror", (e) => {
      log.push("PAGEERROR " + e.stack);
      console.error(e.stack);
    });
    await page.goto(server.url.href);
    await page.evaluate(
      async ({ files }) => {
        const data = await Promise.all([
          ...files.map(async (path) => [
            path,
            new Uint8Array(await (await fetch("/assets" + path)).arrayBuffer()),
          ]),
        ]);
        globalThis.Module = {
          canvas: document.querySelector("canvas"),
          tm4LocalCheckpoint: true,
          noInitialRun: true,
          print: console.log,
          printErr: console.error,
          onAbort: (reason) => {
            globalThis.failure = String(reason);
          },
          onRuntimeInitialized() {
            try {
              const m = globalThis.Module;
              for (const [path, bytes] of data) {
                m.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")));
                m.FS.writeFile(path, bytes);
              }
              m.callMain(["--session"]);
              globalThis.ready = true;
            } catch (e) {
              globalThis.failure = String(e.stack);
            }
          },
        };
      },
      { files: [...assets.files.keys()] },
    );
    await page.addScriptTag({ url: new URL("tm4_web.js", server.url).href });
    await page.waitForFunction(() => globalThis.ready || globalThis.failure, null, {
      timeout: 60000,
    });
    const status = await page.evaluate(() => ({
      ready: globalThis.ready,
      failure: globalThis.failure,
      state: globalThis.tm4Port,
    }));
    console.log("BOOT", status.ready, status.failure);
    if (status.failure) throw Error(status.failure);
    const started = await page.evaluate(
      async ({ titles, playerCount, botSlots }) => {
        const roster = Array.from({ length: playerCount }, (_, i) => titles[i] ?? titles[0]);
        const identities = roster.map((_, i) => (i + 1).toString(16).padStart(16, "0"));
        return await Module.ccall(
          "WebNetStartFfa",
          "number",
          [
            "number",
            "number",
            "number",
            "number",
            "number",
            "number",
            "string",
            "string",
            "number",
            "string",
            "number",
            "number",
            "number",
          ],
          [
            8,
            (1 << playerCount) - 1,
            0,
            12345,
            0,
            3,
            roster.join("\n"),
            identities.join("\n"),
            90,
            [...new Set(roster)].join("\n"),
            27000,
            20,
            botSlots,
          ],
          { async: true },
        );
      },
      { titles: playerCars ?? cars.map((car) => car.title), playerCount, botSlots },
    );
    console.log("STARTED", started);
    if (!started)
      throw Error(
        "TM3 car start failed: " + JSON.stringify(await page.evaluate(() => tm4Port.netSession)),
      );
    await page.waitForTimeout(1500);
    console.log(
      "LOADED",
      await page.evaluate(() => ({
        failure: globalThis.failure,
        car: tm4Port.car,
        tick: tm4Port.netMatch.tick,
      })),
    );
    await page.locator("canvas").screenshot({ path: output + "/loaded.png" });
    return {
      page,
      log,
      async close() {
        await Bun.write(output + "/browser.log", log.join("\n"));
        await browser.close();
        server.stop(true);
      },
    };
  } catch (error) {
    await Bun.write(output + "/browser.log", log.join("\n"));
    await browser?.close();
    server.stop(true);
    throw error;
  }
}
