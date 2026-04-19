import { performance } from "node:perf_hooks";

import { installNodeCanvas } from "../packages/layout/src/node-canvas.ts";

installNodeCanvas();

const workspaceModule =
  (await import("../packages/workspace/dist/index.mjs")) as unknown as typeof import("../packages/workspace/src/index.ts");
const { createWorkspaceEngine } = workspaceModule;

const documentCount = Number.parseInt(process.env.PREMARK_WORKSPACE_DOCS ?? "1000", 10);
const limit = Number.parseInt(process.env.PREMARK_WORKSPACE_LIMIT ?? "500", 10);
const query = process.env.PREMARK_WORKSPACE_QUERY ?? "needle";

const engine = createWorkspaceEngine({
  containerWidth: 360,
  snippetContextBlocks: 0,
});

const documents = Array.from({ length: documentCount }, (_, index) => ({
  id: `doc-${index}`,
  title: `Doc ${index}`,
  markdown: [
    `# Doc ${index}`,
    "",
    `${query} result ${index} with **rendered** Markdown and [link](https://example.com/${index}).`,
    "",
    "- one",
    "- two",
    "",
    "```ts",
    `const value${index} = ${index}`,
    "```",
  ].join("\n"),
}));

const loadStart = performance.now();
engine.loadDocuments(documents);
const loadMs = performance.now() - loadStart;

const result = engine.benchmarkSearchAndRender({
  query,
  limit,
  tileWidth: 320,
  viewport: {
    x: 0,
    y: 0,
    width: 1440,
    height: 960,
  },
});

console.log(
  JSON.stringify(
    {
      ...result,
      loadMs,
    },
    null,
    2,
  ),
);
