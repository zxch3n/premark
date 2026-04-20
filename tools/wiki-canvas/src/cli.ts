#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { createServer } from "vite";

import { resolveEdges, scanMarkdown } from "./scan.ts";

interface CliOptions {
  root: string;
  port: number;
  host: string;
  open: boolean;
  demo: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    port: 5173,
    host: "localhost",
    open: true,
    demo: false,
  };
  let rootSet = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-p":
      case "--port":
        options.port = Number(argv[++i]);
        break;
      case "-h":
      case "--host":
        options.host = argv[++i] ?? options.host;
        break;
      case "--no-open":
        options.open = false;
        break;
      case "--open":
        options.open = true;
        break;
      case "--demo":
        options.demo = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        if (!rootSet && !arg.startsWith("-")) {
          options.root = resolve(arg);
          rootSet = true;
        }
    }
  }

  if (!Number.isFinite(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  return options;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`Premark Wiki Canvas

Scans a folder for Markdown, parses [[wikilinks]], and serves a PixiJS-powered
canvas viewer that renders each note as a 625x625 tile using Premark.

Usage:
  premark-wiki [path] [options]

Options:
  -p, --port <port>    Port to serve on (default: 5173)
  -h, --host <host>    Host to bind to (default: localhost)
  --no-open            Do not open the browser automatically
  --demo               Use the bundled example vault (with [[wikilinks]])
  --help               Show this message
`);
}

async function rebuildPayload(root: string) {
  const start = performance.now();
  const notes = await scanMarkdown(root);
  const edgeMap = resolveEdges(notes);
  const scanTimeMs = performance.now() - start;

  const edges: Array<{ from: string; to: string }> = [];
  const seen = new Set<string>();
  for (const note of notes) {
    for (const target of edgeMap.get(note.id) ?? []) {
      const key = note.id < target ? `${note.id}|${target}` : `${target}|${note.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: note.id, to: target });
    }
  }

  return {
    root,
    scanTimeMs,
    nodes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      relativePath: note.relativePath,
      markdown: note.markdown,
    })),
    edges,
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "../web");
const MONOREPO_ROOT = resolve(HERE, "../../..");
const DEMO_VAULT = resolve(HERE, "../example-vault");

const PACKAGE_ALIASES = {
  "@pretext-md/highlight": resolve(MONOREPO_ROOT, "packages/highlight/src/index.ts"),
  "@pretext-md/layout": resolve(MONOREPO_ROOT, "packages/layout/src/index.ts"),
  "@pretext-md/parser": resolve(MONOREPO_ROOT, "packages/parser/src/index.ts"),
  "@pretext-md/html-renderer": resolve(MONOREPO_ROOT, "packages/html-renderer/src/index.ts"),
  "@pretext-md/wiki-canvas": resolve(MONOREPO_ROOT, "packages/wiki-canvas/src/index.ts"),
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.demo) {
    options.root = DEMO_VAULT;
  }

  // eslint-disable-next-line no-console
  console.log(`◆ Premark Wiki Canvas`);
  // eslint-disable-next-line no-console
  console.log(`  scanning Markdown in ${options.root}`);

  let cachedPayload: Awaited<ReturnType<typeof rebuildPayload>> | null = null;
  const getPayload = async () => {
    cachedPayload ??= await rebuildPayload(options.root);
    return cachedPayload;
  };

  // Warm the scan once to log stats upfront.
  const initialPayload = await getPayload();
  // eslint-disable-next-line no-console
  console.log(
    `  found ${initialPayload.nodes.length} markdown file(s), ${initialPayload.edges.length} wikilink edge(s) in ${initialPayload.scanTimeMs.toFixed(1)}ms`,
  );

  if (initialPayload.nodes.length === 0) {
    // eslint-disable-next-line no-console
    console.error(
      "  no .md files were found — nothing to display.\n  hint: try `pnpm wiki-canvas --demo` to load the bundled example vault.",
    );
    process.exitCode = 1;
    return;
  }
  if (initialPayload.edges.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `  hint: no [[wikilinks]] detected — try \`pnpm wiki-canvas --demo\` to see the linked example vault.`,
    );
  }

  const server = await createServer({
    root: WEB_ROOT,
    configFile: false,
    envFile: false,
    cacheDir: resolve(HERE, "../.vite-cache"),
    resolve: {
      alias: PACKAGE_ALIASES,
    },
    server: {
      port: options.port,
      host: options.host,
      strictPort: false,
      open: options.open,
      fs: {
        strict: false,
        allow: [MONOREPO_ROOT],
      },
    },
    optimizeDeps: {
      // Ensure pixi.js is pre-bundled so the viewer starts fast.
      include: ["pixi.js"],
    },
    plugins: [
      {
        name: "premark-wiki-canvas-payload",
        configureServer(server) {
          const respondWithPayload = async (res: import("node:http").ServerResponse) => {
            try {
              const payload = await getPayload();
              const body = JSON.stringify(payload);
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.setHeader("Cache-Control", "no-store");
              res.end(body);
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String((error as Error)?.message ?? error) }));
            }
          };
          server.middlewares.use((req, res, next) => {
            if (!req.url) return next();
            const url = req.url.split("?")[0];
            if (url === "/payload.json") {
              void respondWithPayload(res);
              return;
            }
            next();
          });

          // Invalidate the payload whenever .md files under the scan root change.
          const invalidate = (path: string) => {
            if (!path.toLowerCase().endsWith(".md")) return;
            if (!path.startsWith(options.root)) return;
            cachedPayload = null;
            server.ws.send({ type: "full-reload" });
          };
          server.watcher.add(options.root);
          server.watcher.on("change", invalidate);
          server.watcher.on("add", invalidate);
          server.watcher.on("unlink", invalidate);
        },
      },
    ],
  });

  await server.listen();
  server.printUrls();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
