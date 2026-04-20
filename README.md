# Honeybadger-Brakepad

A web server that proxies crash reports from Electron apps using Crashpad/Breakpad to the Honeybadger error reporting service.

## Overview

This service receives Breakpad/Crashpad minidump crash reports from Electron applications and forwards them to Honeybadger, converting the crash data into a format Honeybadger can understand.

## Features

- Receives crash reports from Electron apps via Breakpad/Crashpad
- Parses minidump files to extract stack traces
- Transforms crash data to Honeybadger format
- Forwards crash reports to Honeybadger

## Requirements

- Node.js 18+
- Honeybadger account and API key

## Setup

1. Clone the repository:
   ```
   git clone https://github.com/beekeeper-studio/honeybadger-brakepad.git
   cd honeybadger-brakepad
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   HONEYBADGER_API_KEY=your_honeybadger_api_key
   ENVIRONMENT_NAME=production
   PORT=3000
   ```

## Running Locally

Start the server:
```
npm start
```

For development with auto-reload:
```
npm run dev
```

## Deployment on Heroku

1. Create a Heroku app:
   ```
   heroku create your-app-name
   ```

2. Set environment variables:
   ```
   heroku config:set HONEYBADGER_API_KEY=your_honeybadger_api_key
   heroku config:set ENVIRONMENT_NAME=production
   ```

3. Deploy to Heroku:
   ```
   git push heroku main
   ```

## Electron Client Configuration

Configure your Electron app to send crash reports to this server. Crashpad
automatically includes `ver` (Electron version), `platform`, `process_type`,
and `guid` — the server uses `ver` and `platform` to download official Electron
symbols and resolve native stack frames.

### Early initialization (captures crashes before app.ready)

Call `crashReporter.start()` at the **very top of your main process entry
point**, before `app.whenReady()`. This ensures crashes during startup are
captured and uploaded on the next launch via Crashpad's persistent database.

```javascript
// main.js — first lines
const { app, crashReporter } = require('electron');

crashReporter.start({
  productName: 'YourAppName',
  companyName: 'YourCompany',
  submitURL: 'https://your-heroku-app.herokuapp.com/minidump',
  uploadToServer: true,
  extra: {
    // Your app version (distinct from Electron's auto-sent `ver`)
    version: require('./package.json').version,
    // CPU arch — used by the server to fetch the correct symbol bundle
    arch: process.arch,
  }
});

// ... rest of app setup
app.whenReady().then(() => { /* ... */ });
```

### Post-ready initialization (has access to full app APIs)

If you need APIs that are only available after `app.ready` (e.g., runtime
values, user settings), you can start or update the crash reporter later.
Note: crashes that occur *before* this point won't have the extra metadata.

```javascript
const { app, crashReporter } = require('electron');

app.whenReady().then(() => {
  crashReporter.start({
    productName: 'YourAppName',
    companyName: 'YourCompany',
    submitURL: 'https://your-heroku-app.herokuapp.com/minidump',
    uploadToServer: true,
    extra: {
      version: app.getVersion(),
      arch: process.arch,
      // Any additional context you want in Honeybadger's request.context:
      environment: process.env.NODE_ENV || 'production',
      userId: getCurrentUserId(),
    }
  });
});
```

### Renderer process crashes

Renderer processes inherit the crash reporter config from the main process
automatically (Electron 9+). No additional setup is needed — renderer crashes
are uploaded with the same `submitURL` and `extra` fields.

### What gets sent automatically by Crashpad

| Field          | Example         | Notes                                    |
|----------------|-----------------|------------------------------------------|
| `ver`          | `28.1.0`        | Electron version (used for symbols)      |
| `platform`     | `linux`         | OS platform (used for symbols)           |
| `process_type` | `browser`       | Which process crashed                    |
| `prod`         | `Electron`      | Product identifier                       |
| `guid`         | UUID            | Unique client ID (used as fingerprint)   |
| `_companyName` | `YourCompany`   | From config                              |
| `_productName` | `YourAppName`   | From config                              |

These arrive as multipart form fields alongside your `extra` values and the
`upload_file_minidump` binary.

## API

### POST /minidump

Endpoint for receiving crash reports.

- Content-Type: `multipart/form-data`
- Required fields:
  - `upload_file_minidump`: The minidump file
  - `product`: Product name
  - `version`: Application version
  - `guid`: Unique identifier for the crash

## Testing Locally with cURL

You can test your local server using cURL to send a multipart form with a minidump file:

```bash
curl -X POST \
  http://localhost:3000/minidump \
  -H 'Content-Type: multipart/form-data' \
  -F 'upload_file_minidump=@path/to/crash.dmp' \
  -F 'product=YourAppName' \
  -F 'version=1.0.0' \
  -F 'guid=some-unique-id'
```

### Testing with Electron

This project includes a test Electron app that will deliberately crash and send reports to your local server.

1. Start your local server:
```bash
npm run dev
```

2. In another terminal, run the test crash generator:
```bash
npm run test-crash
```

This will open a small Electron app with a "Crash the App" button. When you click it, the app will crash and send a report to your local server.

## Development

Run tests:
```
npm test
```

## License

MIT