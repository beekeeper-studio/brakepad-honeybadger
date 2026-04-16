/**
 * Service for sending crash reports to Honeybadger
 */
const os = require('os');
const axios = require('axios');

// Honeybadger API configuration
const HONEYBADGER_API_URL = 'https://api.honeybadger.io/v1/notices';

/**
 * Derives a Honeybadger error class from a Breakpad/Crashpad crash reason so
 * that distinct signals (SIGSEGV, SIGABRT, EXCEPTION_ACCESS_VIOLATION_*, etc.)
 * group separately in the Honeybadger UI instead of collapsing into a single
 * generic bucket.
 *
 * Examples:
 *   "SIGSEGV /SEGV_MAPERR"                      -> "SIGSEGV"
 *   "EXC_BAD_ACCESS / KERN_INVALID_ADDRESS"     -> "EXC_BAD_ACCESS"
 *   "EXCEPTION_ACCESS_VIOLATION_READ"           -> "EXCEPTION_ACCESS_VIOLATION_READ"
 *   null / "Unknown crash"                      -> "ApplicationCrash"
 */
function deriveErrorClass(crashReason) {
  if (!crashReason || crashReason === 'Unknown crash') {
    return 'ApplicationCrash';
  }
  const match = crashReason.match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return match ? match[0] : 'ApplicationCrash';
}

/**
 * Looks up the operating system string in parsed systemInfo, accepting either
 * the human-readable key ("Operating system") that minidump_stackwalk prints
 * by default or the short "OS" key used in machine-readable output.
 */
function derivePlatform(systemInfo) {
  return (
    systemInfo['Operating system'] ||
    systemInfo.OS ||
    systemInfo['Operating System'] ||
    'unknown'
  );
}

/**
 * Converts a Breakpad/Crashpad crash report to Honeybadger format
 *
 * @param {Object} crashReport - The parsed crash report from Breakpad/Crashpad
 * @returns {Object} - Honeybadger-compatible error report
 */
function transformToHoneybadgerFormat(crashReport) {
  const environmentName = process.env.ENVIRONMENT_NAME || 'production';
  const projectRoot = process.env.HONEYBADGER_PROJECT_ROOT || '';

  // Extract the crashing thread's stack trace
  const threadId = crashReport.crash.threadCrashed;
  const stackTrace = (threadId != null && crashReport.crash.stackTraces[threadId]) || [];

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
      class: deriveErrorClass(crashReport.crash.crashReason),
      message: errorMessage,
      backtrace: backtrace,
      fingerprint: crashReport.metadata.guid || null,
    },
    request: {
      context: {
        product: productName,
        version: productVersion,
        ...crashReport.metadata,
        modules: crashReport.crash.modules || []
      },
      cgi_data: {
        'Content-Type': 'multipart/form-data'
      },
      params: {}
    },
    server: {
      project_root: projectRoot,
      environment_name: environmentName,
      hostname: os.hostname(),
      time: new Date().toISOString(),
      platform: derivePlatform(crashReport.crash.systemInfo || {}),
      language: 'c++'
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
  const apiKey = process.env.HONEYBADGER_API_KEY;
  if (!apiKey) {
    throw new Error('HONEYBADGER_API_KEY environment variable is not set');
  }

  // Transform the crash report to Honeybadger format
  const honeybadgerPayload = transformToHoneybadgerFormat(crashReport);

  try {
    // Send the error report to Honeybadger
    const response = await axios.post(HONEYBADGER_API_URL, honeybadgerPayload, {
      headers: {
        'X-API-Key': apiKey,
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
  sendToHoneybadger,
  transformToHoneybadgerFormat
};