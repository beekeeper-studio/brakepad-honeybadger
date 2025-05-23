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

Configure your Electron app to send crash reports to your server:

```javascript
const { crashReporter } = require('electron');

// In your main process
crashReporter.start({
  productName: 'YourAppName',
  companyName: 'YourCompany',
  submitURL: 'https://your-heroku-app.herokuapp.com/minidump',
  uploadToServer: true,
  // Add any additional fields you want to include
  extra: {
    version: app.getVersion(),
    extra_parameter: 'value'
  }
});
```

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