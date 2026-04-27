/**
 * Tests for the minidump service
 */
const { parseMinidump } = require('./minidumpService');

// Mock the minidump module. Real signature is walkStack(filePath, symbolPaths, callback).
jest.mock('minidump', () => ({
  walkStack: jest.fn((filePath, symbolPaths, callback) => {
    const output =
      'Crash reason: SIGSEGV\n' +
      'Crash address: 0x00000000\n' +
      'Thread 0 (crashed)\n' +
      ' 0  test.exe!main 0x00000001\n' + // ignored - parser only consumes "<idx> 0xADDR rest"
      '0 0x00000001 main\n' +
      '1 0x00000002 start [app.js:10]\n' +
      'Module 0 test.exe test-version (debug-id)';

    callback(null, output);
  })
}));

// Mock the symbol service so no real downloads happen
jest.mock('./symbolService', () => ({
  getSymbolPath: jest.fn().mockResolvedValue('/fake/breakpad_symbols'),
}));

const { getSymbolPath } = require('./symbolService');

describe('minidumpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set the default mock (clearAllMocks wipes it)
    getSymbolPath.mockResolvedValue('/fake/breakpad_symbols');
  });

  describe('parseMinidump', () => {
    test('parses minidump file correctly', async () => {
      const buffer = Buffer.from('Sample minidump content');

      const result = await parseMinidump(buffer);

      expect(result).toBeDefined();
      expect(result.crashReason).toBe('SIGSEGV');
      expect(result.crashAddress).toBe('0x00000000');
      expect(result.threadCrashed).toBe(0);
      expect(Array.isArray(result.stackTraces[0])).toBe(true);
      expect(result.stackTraces[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ frameIndex: 0, function: 'main' }),
          expect.objectContaining({ frameIndex: 1, function: 'start', file: 'app.js', line: 10 })
        ])
      );
      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].name).toBe('test.exe');
    });

    test('passes symbol paths from metadata to walkStack', async () => {
      const walkStack = require('minidump').walkStack;
      const buffer = Buffer.from('Sample minidump content');
      const metadata = { ver: '28.1.0', platform: 'linux', arch: 'x64' };

      await parseMinidump(buffer, metadata);

      expect(getSymbolPath).toHaveBeenCalledWith('28.1.0', 'linux', 'x64');
      // walkStack should receive ['/fake/breakpad_symbols'] as symbolPaths
      expect(walkStack).toHaveBeenCalledWith(
        expect.any(String),          // tmp file path
        ['/fake/breakpad_symbols'],  // symbol paths
        expect.any(Function)         // callback
      );
    });

    test('strips leading "v" from Electron version', async () => {
      const buffer = Buffer.from('Sample minidump content');
      await parseMinidump(buffer, { ver: 'v28.1.0', platform: 'linux' });
      expect(getSymbolPath).toHaveBeenCalledWith('28.1.0', 'linux', undefined);
    });

    test('passes empty symbol paths when metadata is missing', async () => {
      const walkStack = require('minidump').walkStack;
      const buffer = Buffer.from('Sample minidump content');

      await parseMinidump(buffer);

      expect(getSymbolPath).not.toHaveBeenCalled();
      expect(walkStack).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.any(Function)
      );
    });

    test('passes empty symbol paths when ver is missing from metadata', async () => {
      const walkStack = require('minidump').walkStack;
      const buffer = Buffer.from('Sample minidump content');

      await parseMinidump(buffer, { platform: 'linux' });

      expect(getSymbolPath).not.toHaveBeenCalled();
      expect(walkStack).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.any(Function)
      );
    });

    test('degrades gracefully when symbol download fails', async () => {
      getSymbolPath.mockRejectedValue(new Error('network timeout'));
      const walkStack = require('minidump').walkStack;
      const buffer = Buffer.from('Sample minidump content');

      const result = await parseMinidump(buffer, { ver: '99.0.0', platform: 'linux' });

      // Should still parse successfully, just without symbols
      expect(walkStack).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.any(Function)
      );
      expect(result.crashReason).toBe('SIGSEGV');
    });

    test('handles parsing errors', async () => {
      require('minidump').walkStack.mockImplementationOnce((filePath, symbolPaths, callback) => {
        callback(new Error('Failed to parse minidump'), null);
      });

      const buffer = Buffer.from('Invalid minidump content');

      await expect(parseMinidump(buffer)).rejects.toThrow('Failed to parse minidump');
    });
  });
});
