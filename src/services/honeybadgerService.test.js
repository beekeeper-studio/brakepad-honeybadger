/**
 * Tests for the honeybadgerService
 */
const { sendToHoneybadger, transformToHoneybadgerFormat } = require('./honeybadgerService');
const axios = require('axios');

// Mock axios
jest.mock('axios');

// Mock environment variables
const originalEnv = process.env;

describe('honeybadgerService', () => {
  // Sample crash report for testing
  const sampleCrashReport = {
    metadata: {
      product: 'TestApp',
      version: '1.0.0',
      guid: '12345-67890',
      custom_key: 'custom_value'
    },
    crash: {
      crashReason: 'SIGSEGV',
      crashAddress: '0x0000000000000000',
      threadCrashed: 0,
      stackTraces: [[
        {
          frameIndex: 0,
          address: '0x1000',
          function: 'main',
          file: 'app.js',
          line: 42
        },
        {
          frameIndex: 1,
          address: '0x2000',
          function: 'start',
          file: 'app.js',
          line: 30
        }
      ]],
      modules: [],
      systemInfo: { OS: 'Windows' }
    },
    rawMinidump: {
      filename: 'crash.dmp',
      size: 1234
    }
  };

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    process.env.HONEYBADGER_API_KEY = 'test-api-key';
    process.env.ENVIRONMENT_NAME = 'test';
    
    // Reset axios mocks
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('sendToHoneybadger', () => {
    it('should throw error if API key is missing', async () => {
      delete process.env.HONEYBADGER_API_KEY;

      await expect(sendToHoneybadger(sampleCrashReport)).rejects.toThrow(
        'HONEYBADGER_API_KEY environment variable is not set'
      );
    });

    it('should send a properly formatted request to Honeybadger', async () => {
      // Mock successful response from Honeybadger
      axios.post.mockResolvedValueOnce({
        status: 201,
        data: {
          id: 'abc123',
          url: 'https://app.honeybadger.io/notice/abc123'
        }
      });

      const result = await sendToHoneybadger(sampleCrashReport);

      // Verify the API was called correctly
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.honeybadger.io/v1/notices',
        expect.objectContaining({
          notifier: expect.any(Object),
          error: expect.objectContaining({
            class: 'ApplicationCrash',
            message: expect.stringContaining('SIGSEGV'),
            backtrace: expect.arrayContaining([
              expect.objectContaining({
                file: 'app.js',
                method: 'main',
                number: 42
              })
            ])
          }),
          request: expect.objectContaining({
            context: expect.objectContaining({
              product: 'TestApp',
              version: '1.0.0'
            })
          }),
          server: expect.objectContaining({
            environment_name: 'test'
          })
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key'
          })
        })
      );

      // Verify the return value
      expect(result).toEqual({
        id: 'abc123',
        url: 'https://app.honeybadger.io/notice/abc123',
        status: 201
      });
    });

    it('should handle API errors', async () => {
      // Mock error response from Honeybadger
      axios.post.mockRejectedValueOnce({
        message: 'Request failed',
        response: {
          status: 400,
          data: { error: 'Invalid API key' }
        }
      });

      await expect(sendToHoneybadger(sampleCrashReport)).rejects.toThrow(
        'Failed to send report to Honeybadger: Request failed'
      );
    });
  });

  describe('transformToHoneybadgerFormat', () => {
    it('maps stack frames to Honeybadger backtrace entries', () => {
      const payload = transformToHoneybadgerFormat(sampleCrashReport);

      expect(payload.error.backtrace).toEqual([
        { file: 'app.js', method: 'main', number: 42, column: 0 },
        { file: 'app.js', method: 'start', number: 30, column: 0 }
      ]);
    });

    it('uses guid as fingerprint', () => {
      const payload = transformToHoneybadgerFormat(sampleCrashReport);
      expect(payload.error.fingerprint).toBe('12345-67890');
    });

    it('forwards metadata into request.context', () => {
      const payload = transformToHoneybadgerFormat(sampleCrashReport);
      expect(payload.request.context).toEqual(
        expect.objectContaining({
          product: 'TestApp',
          version: '1.0.0',
          guid: '12345-67890',
          custom_key: 'custom_value'
        })
      );
    });

    it('respects ENVIRONMENT_NAME at call time', () => {
      process.env.ENVIRONMENT_NAME = 'staging';
      const payload = transformToHoneybadgerFormat(sampleCrashReport);
      expect(payload.server.environment_name).toBe('staging');
    });

    it('defaults to production when ENVIRONMENT_NAME is unset', () => {
      delete process.env.ENVIRONMENT_NAME;
      const payload = transformToHoneybadgerFormat(sampleCrashReport);
      expect(payload.server.environment_name).toBe('production');
    });

    it('produces an empty backtrace when no thread crashed', () => {
      const report = {
        ...sampleCrashReport,
        crash: { ...sampleCrashReport.crash, threadCrashed: null }
      };
      const payload = transformToHoneybadgerFormat(report);
      expect(payload.error.backtrace).toEqual([]);
    });
  });
});