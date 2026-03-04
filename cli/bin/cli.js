#!/usr/bin/env node

// Thin wrapper that spawns the platform binary downloaded by postinstall.

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ext = process.platform === "win32" ? ".exe" : "";
const binary = path.join(__dirname, `oathbound${ext}`);

if (!fs.existsSync(binary)) {
  console.error(
    "oathbound binary not found. Run `npm rebuild oathbound` or reinstall the package."
  );
  process.exit(1);
}

try {
  execFileSync(binary, process.argv.slice(2), { stdio: "inherit" });
} catch (err) {
  process.exit(err.status ?? 1);
}
