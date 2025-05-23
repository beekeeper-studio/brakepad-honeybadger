/**
 * Main Express server for Honeybadger-Brakepad
 */
// Load environment variables from .env file in local development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const morgan = require('morgan');
const { parseCrashReport } = require('./handlers/crashReportHandler');
const { sendToHoneybadger } = require('./services/honeybadgerService');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for logging only
app.use(morgan('dev')); // HTTP request logging

// IMPORTANT: Do NOT use any body parsers for the /minidump route
// as they can interfere with the raw stream needed for multipart forms
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.send('Honeybadger-Brakepad server is running');
});

/**
 * Route to handle crash reports
 * Processes Breakpad/Crashpad crash reports and forwards them to Honeybadger
 */
app.post('/minidump', async (req, res) => {
  console.log('Received crash report request');
  console.log('Content-Type:', req.headers['content-type'] || req.headers['Content-Type']);
  console.log('Content-Length:', req.headers['content-length'] || req.headers['Content-Length']);
  
  try {
    // Parse the incoming crash report from the Electron app
    const crashReport = await parseCrashReport(req);
    
    if (!crashReport) {
      console.error('Invalid crash report received');
      return res.status(400).json({ error: 'Invalid crash report' });
    }
    
    console.log('Crash report parsed successfully');
    
    // Transform and send the crash report to Honeybadger
    const result = await sendToHoneybadger(crashReport);
    
    console.log('Report sent to Honeybadger:', result.id);
    return res.status(200).json({ 
      success: true,
      honeybadger_id: result.id 
    });
    
  } catch (error) {
    console.error('Error processing crash report:', error.stack || error);
    
    return res.status(500).json({ 
      error: 'Failed to process crash report',
      message: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Honeybadger-Brakepad server running on port ${PORT}`);
});

module.exports = app; // For testing purposes