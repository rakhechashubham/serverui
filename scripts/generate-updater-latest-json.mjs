#!/usr/bin/env node
/**
 * Build Tauri updater latest.json from collected release artifacts + .sig files.
 *
 * Expects files in --dir (default: dist/publish), named roughly:
 *   *.app.tar.gz + *.app.tar.gz.sig   (macOS updater archive)
 *   *.AppImage + *.AppImage.sig
 *   *-setup.exe + *-setup.exe.sig  (prefer NSIS)
 *   *.msi + *.msi.sig
 *
 * Writes latest.json into the same directory.
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

const platforms = {};

const macTar = pick((f) => f.endsWith(".app.tar.gz"));
if (macTar) {
  const signature = readSig(macTar);
  if (signature) {
    // Apple Silicon is the CI target (macos-14). Document Intel separately if added.
    platforms["darwin-aarch64"] = {
      signature,
      url: `${downloadBase}/${macTar}`,
    };
  }
}

const appImage = pick((f) => f.endsWith(".AppImage"));
if (appImage) {
  const signature = readSig(appImage);
  if (signature) {
    platforms["linux-x86_64"] = {
      signature,
      url: `${downloadBase}/${appImage}`,
    };
  }
}

const nsis = pick((f) => f.endsWith("-setup.exe") || (f.endsWith(".exe") && !f.includes("msi")));
if (nsis) {
  const signature = readSig(nsis);
  if (signature) {
    platforms["windows-x86_64"] = {
      signature,
      url: `${downloadBase}/${nsis}`,
    };
  }
} else {
  const msi = pick((f) => f.endsWith(".msi"));
  if (msi) {
    const signature = readSig(msi);
    if (signature) {
      platforms["windows-x86_64"] = {
        signature,
        url: `${downloadBase}/${msi}`,
      };
    }
  }
}

if (Object.keys(platforms).length === 0) {
  console.log("No signed updater artifacts found; skipping latest.json");
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
