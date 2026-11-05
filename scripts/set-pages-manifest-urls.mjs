import { readFile, writeFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  throw new Error("GITHUB_REPOSITORY must be set to owner/repository.");
}

const [owner, name] = repository.split("/");
const baseUrl = `https://${owner}.github.io/${name}/`;
const manifestPath = "dist/manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (!manifest.action || typeof manifest.action !== "object") {
  throw new Error('The built manifest is missing its "action" configuration.');
}

function toPagesUrl(path, field) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`The built manifest is missing "${field}".`);
  }
  return new URL(path.replace(/^\/+/, ""), baseUrl).href;
}

manifest.icon = toPagesUrl(manifest.icon, "icon");
manifest.action.icon = toPagesUrl(manifest.action.icon, "action.icon");
manifest.action.popover = toPagesUrl(
  manifest.action.popover,
  "action.popover",
);
manifest.background_url = toPagesUrl(
  manifest.background_url,
  "background_url",
);

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
