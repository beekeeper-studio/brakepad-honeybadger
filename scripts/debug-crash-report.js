/**
 * Debug script to analyze crash report data format from Electron's crashReporter
 * 
 * This script:
 * 1. Starts a simple HTTP server to receive and log crash reports
 * 2. Launches an Electron app configured to send crash reports to this server
 * 3. Logs the raw multipart form data to help debug parsing issues
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const Busboy = require('busboy');

// Create a debug log directory
const debugDir = path.join(__dirname, '..', 'debug');
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
}

// Configure the debug server
const SERVER_PORT = 3333;
const SERVER_URL = `http://localhost:${SERVER_PORT}/crash`;

// Start a simple HTTP server to receive the crash report
const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] Received request: ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  if (req.method === 'POST' && req.url === '/crash') {
    // Log raw request to file
    const rawRequestFile = path.join(debugDir, `raw-request-${Date.now()}.txt`);
    const rawRequestLog = fs.createWriteStream(rawRequestFile);
    
    console.log(`Saving raw request to ${rawRequestFile}`);
    
    // Log headers
    rawRequestLog.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\n`);
    for (const [key, value] of Object.entries(req.headers)) {
      rawRequestLog.write(`${key}: ${value}\n`);
    }
    rawRequestLog.write('\n');
    
    // Collect raw body data
    const chunks = [];
    req.on('data', (chunk) => {
      console.log(`Received chunk: ${chunk.length} bytes`);
      chunks.push(chunk);
      rawRequestLog.write(chunk);
    });
    
    req.on('end', () => {
      console.log('Request ended');
      rawRequestLog.end();
      
      // Try to parse with Busboy
      try {
        console.log('Attempting to parse with Busboy...');
        const buffer = Buffer.concat(chunks);
        const busboyInstance = Busboy({ headers: req.headers });
        
        busboyInstance.on('field', (fieldname, value) => {
          console.log(`Field: ${fieldname} = ${value}`);
        });
        
        busboyInstance.on('file', (fieldname, file, info) => {
          console.log(`File: ${fieldname}, filename: ${info.filename}`);
          const filename = path.join(debugDir, `${fieldname}-${Date.now()}`);
          const writeStream = fs.createWriteStream(filename);
          
          file.pipe(writeStream);
          
          file.on('end', () => {
            console.log(`File ${fieldname} saved to ${filename}`);
          });
        });
        
        busboyInstance.on('finish', () => {
          console.log('Busboy parsing complete');
        });
        
        busboyInstance.on('error', (error) => {
          console.error('Busboy error:', error);
        });
        
        // Feed the buffer to Busboy
        busboyInstance.end(buffer);
      } catch (error) {
        console.error('Error parsing with Busboy:', error);
      }
      
      // Send a simple response
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'received' }));
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      rawRequestLog.end();
      res.statusCode = 500;
      res.end();
    });
  } else {
    // Return a simple page for other requests
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Debug server running');
  }
});

// Start the debug server
server.listen(SERVER_PORT, () => {
  console.log(`Debug server running at http://localhost:${SERVER_PORT}`);
  
  // Now launch the Electron app
  console.log(`Launching Electron app with crash reporter pointing to ${SERVER_URL}`);
  
  const electronApp = spawn('npx', ['electron', path.join(__dirname, 'generate-test-crash.js'), SERVER_URL], {
    stdio: 'inherit',
    shell: true
  });
  
  electronApp.on('exit', (code) => {
    console.log(`Electron app exited with code ${code}`);
    console.log('Note: The crash reporter will send the crash data after the app terminates');
    console.log('Keeping debug server alive to receive the crash report...');
  });
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down debug server...');
  server.close();
  process.exit();
});