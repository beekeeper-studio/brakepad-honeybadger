/**
 * Service for sending crash reports to Honeybadger
 */
const axios = require('axios');

// Honeybadger API configuration
const HONEYBADGER_API_URL = 'https://api.honeybadger.io/v1/notices';
const HONEYBADGER_API_KEY = process.env.HONEYBADGER_API_KEY;
const ENVIRONMENT_NAME = process.env.ENVIRONMENT_NAME || 'production';

/**
 * Converts a Breakpad/Crashpad crash report to Honeybadger format
 * 
 * @param {Object} crashReport - The parsed crash report from Breakpad/Crashpad
 * @returns {Object} - Honeybadger-compatible error report
 */
function transformToHoneybadgerFormat(crashReport) {
  // Extract the crashing thread's stack trace
  const threadId = crashReport.crash.threadCrashed;
  const stackTrace = crashReport.crash.stackTraces[threadId] || [];
  
  // Convert the stack trace to Honeybadger's backtrace format
  const backtrace = stackTrace.map(frame => ({
    file: frame.file || `<unknown>:${frame.address}`,
    method: frame.function || '<unknown>',
    number: frame.line || 0,
    column: 0,
  }));

  // Get product name and version from metadata
  const productName = crashReport.metadata.product || 'Unknown Product';
  const productVersion = crashReport.metadata.version || 'Unknown Version';
  
  // Generate a descriptive error message
  const errorMessage = `${crashReport.crash.crashReason || 'Application crashed'} at ${crashReport.crash.crashAddress || 'unknown address'}`;
  
  // Build the Honeybadger payload
  return {
    notifier: {
      name: 'honeybadger-brakepad',
      url: 'https://github.com/beekeeper-studio/honeybadger-brakepad',
      version: '1.0.0'
    },
    error: {
      class: 'ApplicationCrash',
      message: errorMessage,
      backtrace: backtrace,
      fingerprint: crashReport.metadata.guid || null,
    },
    request: {
      context: {
        product: productName,
        version: productVersion,
        ...crashReport.metadata
      },
      cgi_data: {
        'Content-Type': 'multipart/form-data'
      },
      params: {}
    },
    server: {
      project_root: '',
      environment_name: ENVIRONMENT_NAME,
      hostname: '',
      time: new Date().toISOString(),
      platform: crashReport.crash.systemInfo.OS || 'unknown',
      language: 'javascript'
    }
  };
}

/**
 * Sends a crash report to Honeybadger
 * 
 * @param {Object} crashReport - The parsed crash report from Breakpad/Crashpad
 * @returns {Promise<Object>} - Honeybadger API response
 */
async function sendToHoneybadger(crashReport) {
  if (!HONEYBADGER_API_KEY) {
    throw new Error('HONEYBADGER_API_KEY environment variable is not set');
  }

  // Transform the crash report to Honeybadger format
  const honeybadgerPayload = transformToHoneybadgerFormat(crashReport);

  try {
    // Send the error report to Honeybadger
    const response = await axios.post(HONEYBADGER_API_URL, honeybadgerPayload, {
      headers: {
        'X-API-Key': HONEYBADGER_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    return {
      id: response.data.id,
      url: response.data.url,
      status: response.status
    };
  } catch (error) {
    console.error('Error sending to Honeybadger:', error.response?.data || error.message);
    throw new Error(`Failed to send report to Honeybadger: ${error.message}`);
  }
}

module.exports = {
  sendToHoneybadger
};