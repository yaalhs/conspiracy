import { readFile, writeFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  throw new Error("GITHUB_REPOSITORY must be set to owner/repository.");
}

const [owner, name, ...extra] = repository.split("/");
if (!owner || !name || extra.length > 0) {
  throw new Error(`Invalid GitHub repository name: ${repository}`);
}

const siteUrl = new URL(
  `${encodeURIComponent(name)}/`,
  `https://${owner}.github.io/`,
);
const manifestPath = new URL("../dist/manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function toPagesUrl(path, field) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error(`The built manifest is missing "${field}".`);
  }
  const extensionPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(extensionPath, siteUrl);
  if (url.origin !== siteUrl.origin || !url.href.startsWith(siteUrl.href)) {
    throw new Error(`The manifest "${field}" must stay within the Pages site.`);
  }
  return url.href;
}

if (!manifest.action || typeof manifest.action !== "object") {
  throw new Error('The built manifest is missing its "action" configuration.');
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
