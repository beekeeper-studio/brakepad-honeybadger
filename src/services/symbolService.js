/**
 * Service for downloading and caching Electron Breakpad symbols.
 *
 * Electron publishes prebuilt Breakpad symbol zips for every release on GitHub.
 * This service downloads them on demand via `@electron/get`, extracts them once,
 * and returns a local path that `minidump_stackwalk` can use as a symbol search
 * root.
 *
 * Cache layout:
 *   <SYMBOL_CACHE_DIR>/<version>-<platform>-<arch>/breakpad_symbols/
 *
 * The cache persists across requests so that only the first crash per
 * (version, platform, arch) tuple incurs a download.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { downloadArtifact } = require('@electron/get');
const extractZip = require('extract-zip');

const DEFAULT_CACHE_DIR = path.join(os.tmpdir(), 'electron-symbols');
const DEFAULT_ARCH = 'x64';

/**
 * Returns the local directory containing Breakpad symbols for the given
 * Electron release, downloading and extracting if not already cached.
 *
 * @param {string} electronVersion - e.g. "28.1.0" (no leading "v")
 * @param {string} platform        - "linux", "darwin", or "win32"
 * @param {string} [arch]          - "x64", "arm64", "ia32" — defaults to x64
 * @returns {Promise<string>} absolute path to the breakpad_symbols directory
 */
async function getSymbolPath(electronVersion, platform, arch) {
  arch = arch || process.env.DEFAULT_ELECTRON_ARCH || DEFAULT_ARCH;
  const cacheDir = process.env.SYMBOL_CACHE_DIR || DEFAULT_CACHE_DIR;
  const key = `${electronVersion}-${platform}-${arch}`;
  const symbolRoot = path.join(cacheDir, key);
  const markerPath = path.join(symbolRoot, '.complete');

  // Fast path — already extracted
  if (fs.existsSync(markerPath)) {
    return findBreakpadDir(symbolRoot);
  }

  console.log(`Downloading Electron ${key} symbols…`);

  const zipPath = await downloadArtifact({
    version: electronVersion,
    platform,
    arch,
    artifactName: 'electron',
    artifactSuffix: 'symbols',
    // Skip checksum verification for symbol zips — not every Electron release
    // lists them in SHASUMS256.txt, and the cost of a checksum miss is just an
    // unsymbolicated crash report.
    unsafelyDisableChecksums: true,
  });

  // Extract into our cache directory
  fs.mkdirSync(symbolRoot, { recursive: true });
  await extractZip(zipPath, { dir: symbolRoot });

  // Write a marker so we know extraction completed
  fs.writeFileSync(markerPath, new Date().toISOString());

  console.log(`Symbols cached at ${symbolRoot}`);
  return findBreakpadDir(symbolRoot);
}

/**
 * Locates the breakpad_symbols subdirectory inside the extracted zip. The zip
 * layout varies by Electron version — sometimes the files are directly in
 * breakpad_symbols/, sometimes nested under electron-v*-symbols/.
 */
function findBreakpadDir(root) {
  // Direct match
  const direct = path.join(root, 'breakpad_symbols');
  if (fs.existsSync(direct)) return direct;

  // One level deep (e.g. electron-v28.1.0-linux-x64-symbols/breakpad_symbols)
  for (const entry of fs.readdirSync(root)) {
    const nested = path.join(root, entry, 'breakpad_symbols');
    if (fs.existsSync(nested)) return nested;
  }

  // Fall back to root — stackwalk will just not find any symbols
  console.warn('Could not locate breakpad_symbols inside', root);
  return root;
}

module.exports = {
  getSymbolPath,
  findBreakpadDir,
};
