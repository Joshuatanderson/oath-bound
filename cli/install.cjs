#!/usr/bin/env node

// Postinstall script: downloads the correct platform binary from GitHub Releases.
// Skips download in CI (binaries don't exist yet during the build job).

if (process.env.CI) {
  console.log("oathbound: skipping binary download in CI");
  process.exit(0);
}

const https = require("https");
const fs = require("fs");
const path = require("path");

const pkg = require("./package.json");
const VERSION = pkg.version;
const REPO = "Joshuatanderson/oath-bound";

const PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
};

const ARCH_MAP = {
  arm64: "arm64",
  x64: "x64",
};

function getBinaryName() {
  const platform = PLATFORM_MAP[process.platform];
  const arch = ARCH_MAP[process.arch];
  if (!platform || !arch) {
    throw new Error(
      `Unsupported platform: ${process.platform}-${process.arch}`
    );
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  return `oathbound-${platform}-${arch}${ext}`;
}

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        // Follow redirects (GitHub sends 302 to S3)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  const binaryName = getBinaryName();
  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${binaryName}`;
  const destDir = path.join(__dirname, "bin");
  const ext = process.platform === "win32" ? ".exe" : "";
  const dest = path.join(destDir, `oathbound${ext}`);

  console.log(`oathbound: downloading ${binaryName} from v${VERSION} release...`);

  fs.mkdirSync(destDir, { recursive: true });

  const data = await download(url);
  fs.writeFileSync(dest, data);
  fs.chmodSync(dest, 0o755);

  console.log(`oathbound: installed to ${dest}`);
}

main().catch((err) => {
  console.error(`oathbound install failed: ${err.message}`);
  console.error("You can download the binary manually from:");
  console.error(`  https://github.com/${REPO}/releases/tag/v${VERSION}`);
  process.exit(1);
});
