/**
 * Tests for the Express server
 */
const request = require('supertest');
const app = require('./index');
const { parseCrashReport } = require('./handlers/crashReportHandler');
const { sendToHoneybadger } = require('./services/honeybadgerService');

// Mock dependencies
jest.mock('./handlers/crashReportHandler', () => ({
  parseCrashReport: jest.fn()
}));

jest.mock('./services/honeybadgerService', () => ({
  sendToHoneybadger: jest.fn()
}));

describe('Express Server', () => {
  afterEach(() => {
    // Reset mocks after each test
    parseCrashReport.mockReset();
    sendToHoneybadger.mockReset();
  });

  test('GET / returns server running message', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Honeybadger-Brakepad server is running');
  });

  test('POST /minidump processes valid crash reports', async () => {
    // Sample crash report
    const mockCrashReport = {
      metadata: { product: 'TestApp' },
      crash: { crashReason: 'SIGSEGV' },
      rawMinidump: { filename: 'test.dmp', size: 1024 }
    };

    // Mock implementations
    parseCrashReport.mockResolvedValue(mockCrashReport);
    sendToHoneybadger.mockResolvedValue({ id: 'test-id-123' });
    
    // Create a simple multipart request (real parsing is tested in crashReportHandler.test.js)
    const response = await request(app)
      .post('/minidump')
      .set('Content-Type', 'multipart/form-data; boundary=boundary')
      .send('--boundary\r\nContent-Disposition: form-data; name="test"\r\n\r\nvalue\r\n--boundary--');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.honeybadger_id).toBe('test-id-123');
    expect(parseCrashReport).toHaveBeenCalled();
    expect(sendToHoneybadger).toHaveBeenCalledWith(mockCrashReport);
  });

  test('POST /minidump handles invalid crash reports', async () => {
    parseCrashReport.mockResolvedValue(null);
    
    const response = await request(app)
      .post('/minidump')
      .set('Content-Type', 'multipart/form-data; boundary=boundary')
      .send('--boundary\r\nContent-Disposition: form-data; name="test"\r\n\r\nvalue\r\n--boundary--');
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid crash report');
    expect(sendToHoneybadger).not.toHaveBeenCalled();
  });

  test('POST /minidump handles errors in crash report parsing', async () => {
    parseCrashReport.mockRejectedValue(new Error('Parsing error'));
    
    const response = await request(app)
      .post('/minidump')
      .set('Content-Type', 'multipart/form-data; boundary=boundary')
      .send('--boundary\r\nContent-Disposition: form-data; name="test"\r\n\r\nvalue\r\n--boundary--');
    
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to process crash report');
    expect(response.body.message).toBe('Parsing error');
    expect(sendToHoneybadger).not.toHaveBeenCalled();
  });
});