/**
 * Tests for the symbol service.
 *
 * @electron/get and extract-zip are mocked so no real downloads happen.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('@electron/get', () => ({
  downloadArtifact: jest.fn(),
}));

jest.mock('extract-zip', () => jest.fn());

const { downloadArtifact } = require('@electron/get');
const extractZip = require('extract-zip');
const { getSymbolPath, findBreakpadDir } = require('./symbolService');

const originalEnv = process.env;

describe('symbolService', () => {
  let tmpRoot;

  beforeEach(() => {
    process.env = { ...originalEnv };
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'symbol-test-'));
    process.env.SYMBOL_CACHE_DIR = tmpRoot;
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getSymbolPath', () => {
    test('downloads, extracts, and returns the breakpad_symbols path', async () => {
      downloadArtifact.mockResolvedValue('/tmp/fake.zip');
      extractZip.mockImplementation(async (zipPath, opts) => {
        const symDir = path.join(opts.dir, 'breakpad_symbols');
        fs.mkdirSync(symDir, { recursive: true });
        fs.writeFileSync(path.join(symDir, 'electron.sym'), 'fake');
      });

      const result = await getSymbolPath('28.1.0', 'linux', 'x64');

      expect(downloadArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '28.1.0',
          platform: 'linux',
          arch: 'x64',
          artifactName: 'electron',
          artifactSuffix: 'symbols',
        })
      );
      expect(extractZip).toHaveBeenCalledWith('/tmp/fake.zip', expect.any(Object));
      expect(result).toContain('breakpad_symbols');
      expect(fs.existsSync(result)).toBe(true);
    });

    test('returns cached path on second call without re-downloading', async () => {
      downloadArtifact.mockResolvedValue('/tmp/fake.zip');
      extractZip.mockImplementation(async (zipPath, opts) => {
        const symDir = path.join(opts.dir, 'breakpad_symbols');
        fs.mkdirSync(symDir, { recursive: true });
      });

      await getSymbolPath('28.1.0', 'linux', 'x64');
      const result = await getSymbolPath('28.1.0', 'linux', 'x64');

      expect(downloadArtifact).toHaveBeenCalledTimes(1);
      expect(result).toContain('breakpad_symbols');
    });

    test('defaults arch to x64 when not specified', async () => {
      downloadArtifact.mockResolvedValue('/tmp/fake.zip');
      extractZip.mockImplementation(async (zipPath, opts) => {
        fs.mkdirSync(path.join(opts.dir, 'breakpad_symbols'), { recursive: true });
      });

      await getSymbolPath('28.1.0', 'darwin');

      expect(downloadArtifact).toHaveBeenCalledWith(
        expect.objectContaining({ arch: 'x64' })
      );
    });

    test('uses DEFAULT_ELECTRON_ARCH env var when set', async () => {
      process.env.DEFAULT_ELECTRON_ARCH = 'arm64';
      downloadArtifact.mockResolvedValue('/tmp/fake.zip');
      extractZip.mockImplementation(async (zipPath, opts) => {
        fs.mkdirSync(path.join(opts.dir, 'breakpad_symbols'), { recursive: true });
      });

      await getSymbolPath('28.1.0', 'darwin');

      expect(downloadArtifact).toHaveBeenCalledWith(
        expect.objectContaining({ arch: 'arm64' })
      );
    });
  });

  describe('findBreakpadDir', () => {
    test('returns direct breakpad_symbols when present', () => {
      const dir = path.join(tmpRoot, 'test-direct');
      const bpDir = path.join(dir, 'breakpad_symbols');
      fs.mkdirSync(bpDir, { recursive: true });
      expect(findBreakpadDir(dir)).toBe(bpDir);
    });

    test('finds nested breakpad_symbols one level deep', () => {
      const dir = path.join(tmpRoot, 'test-nested');
      const bpDir = path.join(dir, 'electron-v28.1.0-linux-x64-symbols', 'breakpad_symbols');
      fs.mkdirSync(bpDir, { recursive: true });
      expect(findBreakpadDir(dir)).toBe(bpDir);
    });

    test('falls back to root when breakpad_symbols not found', () => {
      const dir = path.join(tmpRoot, 'test-fallback');
      fs.mkdirSync(dir, { recursive: true });
      expect(findBreakpadDir(dir)).toBe(dir);
    });
  });
});
