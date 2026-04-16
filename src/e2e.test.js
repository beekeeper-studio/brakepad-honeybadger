/**
 * End-to-end test for the /minidump route.
 *
 * Boots the Express app via supertest (no actual port binding), mocks the
 * `minidump` package so we don't need a real binary or .dmp file, and uses
 * `nock` to capture the outbound POST to Honeybadger.
 */
const request = require('supertest');
const nock = require('nock');

// Mock the minidump module BEFORE requiring the app.
// Real signature: walkStack(filePath, symbolPaths, callback)
jest.mock('minidump', () => ({
  walkStack: jest.fn((filePath, symbolPaths, callback) => {
    const output =
      'Operating system: Linux\n' +
      'CPU: amd64\n' +
      'Crash reason: SIGSEGV /SEGV_MAPERR\n' +
      'Crash address: 0xdeadbeef\n' +
      'Process uptime: 12 seconds\n' +
      '\n' +
      'Thread 0 (crashed)\n' +
      '0 0x0000000000401000 main [crash.cpp:42]\n' +
      '1 0x0000000000401200 __libc_start_main\n' +
      '2 0x0000000000400a30 _start\n' +
      '\n' +
      'Module 0 my-app 1.2.3 (DEBUGID0001)\n' +
      'Module 1 libc.so.6 2.31 (DEBUGID0002)\n';
    callback(null, output);
  })
}));

describe('POST /minidump (end-to-end)', () => {
  let app;

  beforeAll(() => {
    process.env.HONEYBADGER_API_KEY = 'fake-api-key';
    process.env.ENVIRONMENT_NAME = 'test';
    nock.disableNetConnect();
    // supertest binds to 127.0.0.1 on an ephemeral port; allow that.
    nock.enableNetConnect('127.0.0.1');
    app = require('./index');
  });

  afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  test('parses the multipart body, walks the stack, and forwards to Honeybadger', async () => {
    let capturedPayload = null;
    let capturedHeaders = null;

    const honeybadger = nock('https://api.honeybadger.io')
      .post('/v1/notices', (body) => {
        capturedPayload = body;
        return true;
      })
      .reply(function () {
        capturedHeaders = this.req.headers;
        return [
          201,
          {
            id: 'test-notice-id',
            url: 'https://app.honeybadger.io/notice/test-notice-id'
          }
        ];
      });

    const response = await request(app)
      .post('/minidump')
      .field('product', 'TestApp')
      .field('version', '9.9.9')
      .field('guid', 'crash-guid-001')
      .field('custom_key', 'custom_value')
      .attach('upload_file_minidump', Buffer.from('not-a-real-minidump'), 'crash.dmp');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      honeybadger_id: 'test-notice-id'
    });

    expect(honeybadger.isDone()).toBe(true);
    expect(capturedHeaders['x-api-key']).toBe('fake-api-key');

    expect(capturedPayload).toMatchObject({
      notifier: {
        name: 'honeybadger-brakepad',
        url: expect.stringContaining('honeybadger-brakepad')
      },
      error: {
        class: 'ApplicationCrash',
        message: expect.stringContaining('SIGSEGV'),
        fingerprint: 'crash-guid-001'
      },
      request: {
        context: {
          product: 'TestApp',
          version: '9.9.9',
          guid: 'crash-guid-001',
          custom_key: 'custom_value'
        }
      },
      server: {
        environment_name: 'test'
      }
    });

    // The crashing thread's first frame came from "0 0xADDR main [crash.cpp:42]"
    expect(capturedPayload.error.backtrace[0]).toEqual({
      file: 'crash.cpp',
      method: 'main',
      number: 42,
      column: 0
    });
    expect(capturedPayload.error.backtrace.length).toBeGreaterThanOrEqual(3);
  });

  test('returns 500 when HONEYBADGER_API_KEY is missing', async () => {
    delete process.env.HONEYBADGER_API_KEY;

    const response = await request(app)
      .post('/minidump')
      .field('product', 'TestApp')
      .field('version', '9.9.9')
      .field('guid', 'crash-guid-002')
      .attach('upload_file_minidump', Buffer.from('not-a-real-minidump'), 'crash.dmp');

    expect(response.status).toBe(500);
    expect(response.body.message).toContain('HONEYBADGER_API_KEY');

    process.env.HONEYBADGER_API_KEY = 'fake-api-key';
  });
});
