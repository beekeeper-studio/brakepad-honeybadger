/**
 * Simple unit test for Honeybadger-Brakepad crash report parsing
 */

const { parseCrashReport } = require('./handlers/crashReportHandler');
const { parseMinidump } = require('./services/minidumpService');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

// Mock the honeybadger service
jest.mock('./services/honeybadgerService', () => ({
  sendToHoneybadger: jest.fn().mockResolvedValue({ id: 'mock-honeybadger-id' })
}));

// Mock the minidump service
jest.mock('./services/minidumpService', () => ({
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

describe('Crash Report Integration', () => {
  // Create sample crash data
  const SAMPLE_METADATA = {
    product: 'TestElectronApp',
    version: '1.0.0',
    guid: 'test-guid-1234',
    timestamp: new Date().toISOString(),
    custom_key: 'custom_value'
  };
  
  beforeEach(() => {
    // Reset the mock
    parseMinidump.mockClear();
  });

  /**
   * This test validates that the crash report handler correctly
   * parses a multipart form with a minidump file
   */
  test('should process a multipart form crash report', async () => {
    // Create a boundary for the multipart form
    const boundary = '---MultipartBoundary-UqbY7yPgpIUw4nuEqIUNzvezfMO01vUI---';
    
    // Construct form data
    let formData = '';
    
    // Add metadata fields
    for (const [key, value] of Object.entries(SAMPLE_METADATA)) {
      formData += `--${boundary}\r\n`;
      formData += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      formData += `${value}\r\n`;
    }
    
    // Add the minidump file
    formData += `--${boundary}\r\n`;
    formData += `Content-Disposition: form-data; name="upload_file_minidump"; filename="minidump.dmp"\r\n`;
    formData += `Content-Type: application/octet-stream\r\n\r\n`;
    
    // Create sample minidump data with recognizable content
    const minidumpData = Buffer.from(
      'MDMP' +                     // Magic number
      '\x93\x0A\x00\x00' +         // Version
      '\x08\x00\x00\x00' +         // Stream count
      'Crash reason: SIGSEGV\n' +  // Something for the parser to find
      'Crash address: 0x00000000\n' +
      'Thread 0 (crashed)\n' +
      '0 0x00000001 main\n' +
      '1 0x00000002 start [app.js:10]\n' +
      'Module 0 test.exe test-version (debug-id)'
    );
    
    // Add the form closing boundary
    const formFooter = `\r\n--${boundary}--\r\n`;
    
    // Combine all parts
    const fullForm = Buffer.concat([
      Buffer.from(formData, 'utf8'),
      minidumpData,
      Buffer.from(formFooter, 'utf8')
    ]);
    
    // Create a mock request object
    const req = new Readable();
    req.push(fullForm);
    req.push(null); // End the stream
    
    // Set headers
    req.headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`
    };
    
    // Process the crash report
    const crashReport = await parseCrashReport(req);
    
    // Verify the crash report structure
    expect(crashReport).toBeDefined();
    expect(crashReport.metadata).toBeDefined();
    expect(crashReport.metadata.product).toBe('TestElectronApp');
    expect(crashReport.metadata.version).toBe('1.0.0');
    expect(crashReport.metadata.guid).toBe('test-guid-1234');
    expect(crashReport.metadata.custom_key).toBe('custom_value');
    
    // Verify minidump was processed
    expect(parseMinidump).toHaveBeenCalled();
    
    // Verify crash info
    expect(crashReport.crash).toBeDefined();
    expect(crashReport.crash.crashReason).toBe('SIGSEGV');
    expect(crashReport.crash.crashAddress).toBe('0x00000000');
    
    // Verify raw minidump info
    expect(crashReport.rawMinidump).toBeDefined();
    expect(crashReport.rawMinidump.filename).toBe('minidump.dmp');
    expect(crashReport.rawMinidump.size).toBeGreaterThan(0);
  });
});