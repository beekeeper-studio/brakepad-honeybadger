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

4. **Symbol Resolution** (`src/services/symbolService.js`)
   - When the crash report includes Crashpad auto-fields `ver` (Electron version) and `platform`, the server downloads official Breakpad symbols from the Electron GitHub release for that version
   - Uses `@electron/get` (handles mirrors, caching, checksums) to fetch the zip and `extract-zip` to unpack it
   - Symbols are cached on disk at `<SYMBOL_CACHE_DIR>/<version>-<platform>-<arch>/breakpad_symbols/` — only the first crash per combo incurs a download
   - Graceful degradation: if `ver`/`platform` are absent or the download fails, `minidump_stackwalk` runs without symbols (addresses remain unresolved)
   - Covers all Electron-shipped binaries (electron, libffmpeg, V8, Chromium, etc.); native Node addons need symbols from your own build pipeline

5. **Configuration**
   - `HONEYBADGER_API_KEY` (required) — Honeybadger project API key
   - `ENVIRONMENT_NAME` (optional, default `production`) — reported as `server.environment_name`
   - `HONEYBADGER_PROJECT_ROOT` (optional) — Honeybadger path-prefix stripping
   - `SYMBOL_CACHE_DIR` (optional, default `os.tmpdir()/electron-symbols`) — persistent symbol cache
   - `DEFAULT_ELECTRON_ARCH` (optional, default `x64`) — fallback CPU arch for symbol downloads
   - `PORT` (optional, default `3000`)
   - `.env` is loaded automatically when `NODE_ENV !== 'production'`

6. **Client Integration**
   - Electron app's `crashReporter.start({ submitURL: 'https://<host>/minidump', ... })`
   - Crashpad auto-sends `ver` (Electron version), `platform`, `process_type`, `prod`, `guid`
   - Extra metadata supplied via `extra` is forwarded as multipart fields and surfaces in `request.context`
   - Recommended `extra` fields: `version` (your app version), `arch` (= `process.arch`, for symbol resolution)

## Technologies

- Node.js (>= 18) Express server
- `busboy` for multipart/form-data parsing
- `minidump` (electron/node-minidump) for stackwalking
- `@electron/get` for downloading official Electron symbol artifacts
- `extract-zip` for unpacking symbol zips
- `axios` for Honeybadger API requests
- `morgan` for request logging
- Jest + supertest + nock for tests

## Deployment

- Runs as a long-lived Express process (see `Procfile`: `web: node src/index.js`)
- Heroku is the canonical target, but any Node 18+ host works
- Required env vars: `HONEYBADGER_API_KEY`
- Optional: `ENVIRONMENT_NAME`, `PORT`, `SYMBOL_CACHE_DIR`, `DEFAULT_ELECTRON_ARCH`, `HONEYBADGER_PROJECT_ROOT`
- For Heroku: consider a persistent volume or addon for `SYMBOL_CACHE_DIR` so symbols survive dyno restarts
