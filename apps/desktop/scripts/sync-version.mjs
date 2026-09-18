#!/usr/bin/env node
/**
 * Single source of truth: apps/desktop/src-tauri/tauri.conf.json → version
 * Syncs that SemVer into Cargo.toml and apps/desktop/package.json.
 *
 * Usage (from apps/desktop or repo root via make):
 *   node scripts/sync-version.mjs
 *   node scripts/sync-version.mjs 1.2.3
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const confPath = path.join(desktopDir, "src-tauri", "tauri.conf.json");
const cargoPath = path.join(desktopDir, "src-tauri", "Cargo.toml");
const pkgPath = path.join(desktopDir, "package.json");

const SEMVER = /^\d+\.\d+\.\d+$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const argVersion = process.argv[2];
const conf = readJson(confPath);

if (argVersion) {
  if (!SEMVER.test(argVersion)) {
    console.error(`Invalid SemVer: ${argVersion} (expected MAJOR.MINOR.PATCH)`);
    process.exit(1);
  }
  conf.version = argVersion;
  writeJson(confPath, conf);
}

const version = conf.version;
if (!SEMVER.test(version)) {
  console.error(`tauri.conf.json version is not SemVer: ${version}`);
  process.exit(1);
}

let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, cargo);

const pkg = readJson(pkgPath);
pkg.version = version;
writeJson(pkgPath, pkg);

console.log(`Desktop version synced to ${version}`);
console.log(`  - ${path.relative(desktopDir, confPath)}`);
console.log(`  - ${path.relative(desktopDir, cargoPath)}`);
console.log(`  - ${path.relative(desktopDir, pkgPath)}`);
