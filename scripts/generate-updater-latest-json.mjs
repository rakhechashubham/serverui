#!/usr/bin/env node
/**
 * Build Tauri updater latest.json from collected release artifacts + .sig files.
 *
 * Expects files in --dir (default: dist/publish), named:
 *   ServerUI-<ver>-arm64.app.tar.gz[.sig]
 *   ServerUI-<ver>-x64.app.tar.gz[.sig]
 *   ServerUI-<ver>-x86_64.AppImage[.sig]
 *   ServerUI-<ver>-x64-setup.exe[.sig]  (prefer NSIS)
 *   ServerUI-<ver>-x64.msi[.sig]
 *
 * Writes latest.json ONLY when at least one signed platform mapping exists.
 * Never invents signatures.
 *
 * Usage:
 *   node scripts/generate-updater-latest-json.mjs \
 *     --version 0.1.0 \
 *     --tag v0.1.0 \
 *     --repo owner/name \
 *     --dir dist/publish
 */
import fs from "node:fs";
import path from "node:path";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const version = arg("version");
const tag = arg("tag", version ? `v${version}` : undefined);
const repo = arg("repo", process.env.GITHUB_REPOSITORY);
const dir = path.resolve(arg("dir", "dist/publish"));
const notes = arg("notes", `ServerUI ${version}`);

if (!version || !tag || !repo) {
  console.error("Required: --version, --tag, --repo (or GITHUB_REPOSITORY)");
  process.exit(1);
}

if (!fs.existsSync(dir)) {
  console.error(`Directory not found: ${dir}`);
  process.exit(1);
}

const files = fs.readdirSync(dir);
const downloadBase = `https://github.com/${repo}/releases/download/${tag}`;

function readSig(artifactName) {
  const sigPath = path.join(dir, `${artifactName}.sig`);
  if (!fs.existsSync(sigPath)) return null;
  return fs.readFileSync(sigPath, "utf8").trim();
}

function pick(matcher) {
  return files.find((f) => matcher(f) && !f.endsWith(".sig"));
}

function addPlatform(platforms, key, artifactName) {
  if (!artifactName) return;
  const signature = readSig(artifactName);
  if (!signature) return;
  platforms[key] = {
    signature,
    url: `${downloadBase}/${artifactName}`,
  };
}

const platforms = {};

// Prefer explicit arch suffixes (ServerUI-<ver>-arm64.app.tar.gz / -x64.app.tar.gz).
const macArm = pick(
  (f) => f.endsWith("-arm64.app.tar.gz") || (f.includes("-arm64.") && f.endsWith(".app.tar.gz")),
);
const macX64 = pick(
  (f) =>
    f.endsWith("-x64.app.tar.gz") ||
    (f.includes("-x64.") && f.endsWith(".app.tar.gz") && !f.includes("arm64")),
);
addPlatform(platforms, "darwin-aarch64", macArm);
addPlatform(platforms, "darwin-x86_64", macX64);

// Fallback: single unsigned-name mac archive → Apple Silicon only (legacy CI).
if (!platforms["darwin-aarch64"] && !platforms["darwin-x86_64"]) {
  const macTar = pick((f) => f.endsWith(".app.tar.gz"));
  if (macTar) {
    if (macTar.includes("x64") || macTar.includes("x86_64") || macTar.includes("amd64")) {
      addPlatform(platforms, "darwin-x86_64", macTar);
    } else {
      addPlatform(platforms, "darwin-aarch64", macTar);
    }
  }
}

const appImage = pick((f) => f.endsWith(".AppImage"));
addPlatform(platforms, "linux-x86_64", appImage);

const nsis = pick((f) => f.endsWith("-setup.exe"));
if (nsis) {
  addPlatform(platforms, "windows-x86_64", nsis);
} else {
  const msi = pick((f) => f.endsWith(".msi"));
  addPlatform(platforms, "windows-x86_64", msi);
}

if (Object.keys(platforms).length === 0) {
  console.log("No signed updater artifacts found; skipping latest.json (will not publish a fake manifest)");
  process.exit(0);
}

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

const out = path.join(dir, "latest.json");
fs.writeFileSync(out, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`Wrote ${out} with platforms: ${Object.keys(platforms).join(", ")}`);
