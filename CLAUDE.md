# Honeybadger-Brakepad Architecture

This Express server proxies crash reports from Electron apps using Crashpad/Breakpad to the Honeybadger error reporting service.

## Protocols

### Breakpad/Crashpad Protocol
- Electron apps generate minidumps via the Crashpad/Breakpad libraries
- Crash data is sent as multipart/form-data POST requests
- Key fields:
  - `upload_file_minidump`: Binary minidump file containing crash information
  - `product`: Product name
  - `version`: Application version
  - `guid`: Unique identifier for the crash
  - Custom key-value parameters for additional context

### Honeybadger API
- RESTful JSON API
- POST to `https://api.honeybadger.io/v1/notices`
- Requires API key in the request
- Expected payload structure:
  ```json
  {
    "notifier": {
      "name": "honeybadger-brakepad",
      "url": "https://github.com/beekeeper-studio/honeybadger-brakepad",
      "version": "1.0.0"
    },
    "error": {
      "class": "Crash",
      "message": "Application crashed",
      "backtrace": [...],
      "fingerprint": "..."
    },
    "request": {
      "context": {},
      "cgi_data": {},
      "params": {}
    },
    "server": {
      "project_root": "",
      "environment_name": "production",
      "hostname": ""
    }
  }
  ```

## Implementation Approach

1. **Express Server Structure** (`src/index.js`)
   - `POST /minidump` route receives crash reports
   - `GET /` health check
   - `morgan` for HTTP request logging
   - No body parsers on `/minidump` — busboy needs the raw multipart stream

2. **Processing Pipeline**
   - Receive and validate Breakpad/Crashpad crash report (`src/handlers/crashReportHandler.js`)
   - Parse minidump to extract stack traces and error information (`src/services/minidumpService.js`)
   - Transform data into Honeybadger-compatible format (`src/services/honeybadgerService.js`)
   - Submit to Honeybadger API
   - Return success/failure response

3. **Minidump Processing**
   - The `minidump` npm package wraps Breakpad's `minidump_stackwalk` and ships prebuilt binaries for Linux x64, macOS x64, and macOS arm64
   - `walkStack` takes a file path, so the handler writes the uploaded buffer to a temp file under `os.tmpdir()` and cleans it up afterwards
   - The text output is parsed line-by-line into a structured object (crash reason, address, crashing thread, stack frames, modules, system info)

4. **Configuration**
   - `HONEYBADGER_API_KEY` (required) — Honeybadger project API key
   - `ENVIRONMENT_NAME` (optional, default `production`) — reported as `server.environment_name`
   - `PORT` (optional, default `3000`)
   - `.env` is loaded automatically when `NODE_ENV !== 'production'`

5. **Client Integration**
   - Electron app's `crashReporter.start({ submitURL: 'https://<host>/minidump', ... })`
   - Extra metadata supplied via `extra` is forwarded as multipart fields and surfaces in `request.context`

## Technologies

- Node.js (>= 18) Express server
- `busboy` for multipart/form-data parsing
- `minidump` (electron/node-minidump) for stackwalking
- `axios` for Honeybadger API requests
- `morgan` for request logging
- Jest + supertest + nock for tests

## Deployment

- Runs as a long-lived Express process (see `Procfile`: `web: node src/index.js`)
- Heroku is the canonical target, but any Node 18+ host works
- Required env vars: `HONEYBADGER_API_KEY`, optional: `ENVIRONMENT_NAME`, `PORT`
