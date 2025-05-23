/**
 * Integration test for Honeybadger-Brakepad
 * 
 * This script:
 * 1. Starts the Express server
 * 2. Launches an Electron app configured to send crash reports to the server
 * 3. Causes the Electron app to crash
 * 4. Logs the server's handling of the crash report
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const http = require('http');
const waitOn = require('wait-on');
const fs = require('fs');

// Configuration
const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}/minidump`;
const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds
const SERVER_LOG_FILE = path.join(__dirname, '..', 'logs', 'server.log');
const ELECTRON_LOG_FILE = path.join(__dirname, '..', 'logs', 'electron.log');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Clear previous log files
fs.writeFileSync(SERVER_LOG_FILE, '');
fs.writeFileSync(ELECTRON_LOG_FILE, '');

console.log('Starting integration test...');

// Start the server
const server = spawn('node', ['src/index.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: SERVER_PORT, DEBUG: 'express:*,honeybadger-brakepad:*' },
  stdio: ['ignore', 'pipe', 'pipe']
});

// Log server output to file and console
const serverLogStream = fs.createWriteStream(SERVER_LOG_FILE, { flags: 'a' });
server.stdout.pipe(serverLogStream);
server.stderr.pipe(serverLogStream);

server.stdout.on('data', (data) => {
  console.log(`[SERVER]: ${data.toString().trim()}`);
});

server.stderr.on('data', (data) => {
  console.error(`[SERVER ERROR]: ${data.toString().trim()}`);
});

// Wait for server to be ready
waitOn({
  resources: [`http-get://localhost:${SERVER_PORT}`],
  timeout: SERVER_STARTUP_TIMEOUT
}).then(() => {
  console.log(`Server started on port ${SERVER_PORT}`);
  console.log('Starting Electron app with crash reporter...');
  
  // Launch the Electron app that will crash
  const electronApp = spawn('node', [path.join(__dirname, 'generate-test-crash.js'), SERVER_URL], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Log Electron app output
  const electronLogStream = fs.createWriteStream(ELECTRON_LOG_FILE, { flags: 'a' });
  electronApp.stdout.pipe(electronLogStream);
  electronApp.stderr.pipe(electronLogStream);

  electronApp.stdout.on('data', (data) => {
    console.log(`[ELECTRON]: ${data.toString().trim()}`);
  });

  electronApp.stderr.on('data', (data) => {
    console.error(`[ELECTRON ERROR]: ${data.toString().trim()}`);
  });

  // Automatically click the crash button after app loads
  setTimeout(() => {
    // For Linux
    if (process.platform === 'linux') {
      exec('xdotool search --name "Crash Test App" windowactivate --sync click 200 150', (error) => {
        if (error) {
          console.error('Failed to automate click with xdotool:', error);
          console.log('Please click the "Crash the App" button manually in the Electron window.');
        }
      });
    } 
    // For macOS
    else if (process.platform === 'darwin') {
      // Note: This requires the cliclick tool to be installed
      // brew install cliclick
      exec('cliclick c:200,150', (error) => {
        if (error) {
          console.error('Failed to automate click with cliclick:', error);
          console.log('Please click the "Crash the App" button manually in the Electron window.');
        }
      });
    }
    // For Windows, you'd need to integrate with something like AutoHotkey or similar
    else {
      console.log('Auto-clicking not supported on this platform.');
      console.log('Please click the "Crash the App" button manually in the Electron window.');
    }
  }, 3000); // Wait 3 seconds for the app to load

  // Set a timeout for the entire test
  setTimeout(() => {
    console.log('Test complete. Shutting down server...');
    server.kill();
    process.exit(0);
  }, 30000); // 30 seconds total test time
}).catch((err) => {
  console.error('Failed to start server:', err);
  server.kill();
  process.exit(1);
});

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('Test interrupted. Cleaning up...');
  server.kill();
  process.exit(1);
});

// Handle server process exit
server.on('exit', (code) => {
  console.log(`Server process exited with code ${code}`);
  
  // If server exits unexpectedly (not by our cleanup)
  if (code !== null && code !== 0) {
    console.error('Server crashed unexpectedly');
    process.exit(1);
  }
});