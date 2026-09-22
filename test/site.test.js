import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("static product site has its required entry points and Pages workflow", async () => {
  const [html, script, workflow] = await Promise.all([
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/index.js", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(html, /SUPPORTED LANGUAGES/);
  assert.match(html, /TypeScript/);
  assert.match(html, /JavaScript/);
  assert.match(html, /Python/);
  assert.match(html, /<script src="index.js"><\/script>/);
  assert.match(script, /grayscale-development\/graph-ai/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: docs/);
});
