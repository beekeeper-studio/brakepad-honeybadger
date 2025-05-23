/**
 * Test for the crash report handler
 */
const http = require('http');
const { Readable } = require('stream');
const { parseCrashReport } = require('./crashReportHandler');
const { parseMinidump } = require('../services/minidumpService');

// Mock the minidump service
jest.mock('../services/minidumpService', () => ({
  parseMinidump: jest.fn().mockResolvedValue({
    crashReason: 'SIGSEGV',
    crashAddress: '0x00000000',
    threadCrashed: 0,
    stackTraces: [[
      { frameIndex: 0, address: '0x00000001', function: 'main' },
      { frameIndex: 1, address: '0x00000002', function: 'start', file: 'app.js', line: 10 }
    ]],
    modules: [{ index: '0', name: 'test.exe', version: 'test-version', debugId: 'debug-id' }],
    systemInfo: { 'OS': 'Windows' }
  })
}));

describe('crashReportHandler', () => {
  describe('parseCrashReport', () => {
    test('successfully parses a valid crash report', async () => {
      // Create a boundary for the multipart form
      const boundary = 'TestBoundary';
      
      // Create multipart form data for the test
      const formData = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="product"',
        '',
        'TestApp',
        `--${boundary}`,
        'Content-Disposition: form-data; name="version"',
        '',
        '1.0.0',
        `--${boundary}`,
        'Content-Disposition: form-data; name="upload_file_minidump"; filename="test.dmp"',
        'Content-Type: application/octet-stream',
        '',
        'Sample minidump data',
        `--${boundary}--`
      ].join('\r\n');
      
      // Create a mock request object that mimics an Express request
      const req = new Readable();
      req.push(formData);
      req.push(null); // End the stream
      
      // Add headers to the request
      req.headers = {
        'content-type': `multipart/form-data; boundary=${boundary}`
      };
      
      // Call the parseCrashReport function
      const result = await parseCrashReport(req);
      
      // Verify the result
      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.product).toBe('TestApp');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.crash).toBeDefined();
      expect(result.crash.crashReason).toBe('SIGSEGV');
      expect(result.rawMinidump).toBeDefined();
      expect(result.rawMinidump.filename).toBe('test.dmp');
      
      // Verify that parseMinidump was called
      expect(parseMinidump).toHaveBeenCalled();
    });
    
    test('rejects if content-type header is missing', async () => {
      // Create a mock request object without content-type header
      const req = new Readable();
      req.headers = {};
      
      // Expect the function to reject with an error
      await expect(parseCrashReport(req)).rejects.toThrow('Content-Type must be multipart/form-data');
    });
    
    test('rejects if minidump file is missing', async () => {
      // Create a boundary for the multipart form
      const boundary = 'TestBoundary';
      
      // Create multipart form data without a minidump file
      const formData = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="product"',
        '',
        'TestApp',
        `--${boundary}`,
        'Content-Disposition: form-data; name="version"',
        '',
        '1.0.0',
        `--${boundary}--`
      ].join('\r\n');
      
      // Create a mock request object
      const req = new Readable();
      req.push(formData);
      req.push(null); // End the stream
      
      // Add headers to the request
      req.headers = {
        'content-type': `multipart/form-data; boundary=${boundary}`
      };
      
      // Expect the function to reject with a missing minidump error
      await expect(parseCrashReport(req)).rejects.toThrow('Missing minidump file');
    });
    
    test('handles parsing errors gracefully', async () => {
      // Mock implementation to simulate an error
      parseMinidump.mockImplementationOnce(() => {
        throw new Error('Failed to parse minidump');
      });
      
      // Create a boundary for the multipart form
      const boundary = 'TestBoundary';
      
      // Create multipart form data for the test
      const formData = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="product"',
        '',
        'TestApp',
        `--${boundary}`,
        'Content-Disposition: form-data; name="upload_file_minidump"; filename="test.dmp"',
        'Content-Type: application/octet-stream',
        '',
        'Invalid minidump data',
        `--${boundary}--`
      ].join('\r\n');
      
      // Create a mock request object
      const req = new Readable();
      req.push(formData);
      req.push(null); // End the stream
      
      // Add headers to the request
      req.headers = {
        'content-type': `multipart/form-data; boundary=${boundary}`
      };
      
      // Expect the function to reject with a parsing error
      await expect(parseCrashReport(req)).rejects.toThrow('Failed to parse minidump');
    });
  });
});