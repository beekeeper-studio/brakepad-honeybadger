# Honeybadger-Brakepad Architecture

This AWS Lambda function proxies crash reports from Electron apps using Crashpad/Breakpad to the Honeybadger error reporting service.

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

1. **Lambda Function Structure**
   - Handler for API Gateway requests
   - Middleware for parsing multipart/form-data
   - Crash report processor
   - Honeybadger API client

2. **Processing Pipeline**
   - Receive and validate Breakpad/Crashpad crash report
   - Parse minidump to extract stack traces and error information
   - Transform data into Honeybadger-compatible format
   - Submit to Honeybadger API
   - Return success/failure response

3. **Minidump Processing**
   - Use minidump-stackwalk or similar tool to extract useful information
   - Parse stack traces to create Honeybadger-compatible backtrace
   - Extract crash reason and convert to error class/message

4. **Configuration**
   - Environment variables for Honeybadger API key
   - Optional environment name configuration
   - Symbol file configuration (if applicable)

5. **Client Integration**
   - Electron app configuration to point to Lambda endpoint
   - Additional metadata to include with crash reports

## Technologies

- Node.js Lambda function
- AWS API Gateway for handling HTTP requests
- AWS Lambda for serverless execution
- busboy or formidable for multipart form parsing
- node-fetch or axios for Honeybadger API requests
- minidump-tools or custom processing for crash data extraction

## Deployment

- Packaged as AWS Lambda function
- API Gateway configuration for receiving crash reports
- IAM roles for necessary permissions
- Environment variables for configuration