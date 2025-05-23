/**
 * A simple Electron app to generate test crashes for the Honeybadger-Brakepad service.
 * 
 * Usage:
 * npm install electron
 * node scripts/generate-test-crash.js [server-url]
 * 
 * The server-url is optional. By default, it will use http://localhost:3000/minidump
 */

const { app, BrowserWindow, crashReporter, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Get the submit URL from command line or use default
const submitURL = process.argv[2] || 'http://localhost:3000/minidump';

// Start the crash reporter
app.whenReady().then(() => {
  console.log(`Configuring crash reporter to send reports to: ${submitURL}`);
  
  crashReporter.start({
    productName: 'TestElectronApp',
    companyName: 'HoneybadgerTest',
    submitURL: submitURL,
    uploadToServer: true,
    ignoreSystemCrashHandler: false,
    extra: {
      version: '1.0.0',
      testRun: 'true',
      timestamp: new Date().toISOString(),
      custom_key: 'custom_value'
    }
  });

  // Create a window to display the crash button
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Simple HTML page with a crash button
  mainWindow.loadURL(`data:text/html,
    <html>
      <head>
        <title>Crash Test App</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          button { padding: 10px 20px; font-size: 16px; margin: 10px; }
        </style>
      </head>
      <body>
        <h1>Crash Test App</h1>
        <p>This app will deliberately crash when you click the button below.</p>
        <button id="crash-button">Crash the App</button>
        <script>
          const { ipcRenderer } = require('electron');
          document.getElementById('crash-button').addEventListener('click', () => {
            ipcRenderer.send('crash-app');
          });
        </script>
      </body>
    </html>
  `);

  // Listen for crash request from the renderer
  ipcMain.on('crash-app', () => {
    console.log('Deliberately crashing the app now...');
    process.crash();
  });

  // Log crash reporter info
  console.log('Crash reporter configuration:');
  console.log(crashReporter.getUploadToServer());
  console.log(crashReporter.getParameters());
});

// Keep the app open until explicitly quit
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});