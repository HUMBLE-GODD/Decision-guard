import { existsSync, readFileSync } from "node:fs";

const html = readFileSync("public/index.html", "utf8");
const css = readFileSync("public/styles.css", "utf8");
const js = readFileSync("public/app.js", "utf8");

for (const [name, value] of [["public/index.html", html], ["public/styles.css", css], ["public/app.js", js]] as const) {
  if (!existsSync(name) || value.length < 100) throw new Error(`${name} is missing or unexpectedly small`);
}

for (const marker of ["preflight-form", "search-form", "graph-canvas", "metric-memories", "/api/v1/status", "/api/v1/decisions/preview", "/api/v1/search", "/api/v1/graph"]) {
  if (!html.includes(marker) && !js.includes(marker)) throw new Error(`UI marker missing: ${marker}`);
}

console.log(JSON.stringify({ status: "ok", assets: ["index.html", "styles.css", "app.js"], interactions: ["status", "decision-preflight", "memory-search", "semantic-graph"] }, null, 2));
