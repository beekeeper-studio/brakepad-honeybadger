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

describe('minidumpService', () => {
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

    test('handles parsing errors', async () => {
      require('minidump').walkStack.mockImplementationOnce((filePath, symbolPaths, callback) => {
        callback(new Error('Failed to parse minidump'), null);
      });

      const buffer = Buffer.from('Invalid minidump content');

      await expect(parseMinidump(buffer)).rejects.toThrow('Failed to parse minidump');
    });
  });
});
