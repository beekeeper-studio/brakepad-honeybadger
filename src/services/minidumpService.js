/**
 * Service for processing minidump files from Breakpad/Crashpad
 */
const minidump = require('minidump');
const { promisify } = require('util');

// Promisify the minidump.walkStack function
const walkStackAsync = promisify(minidump.walkStack);

/**
 * Parses a minidump file to extract crash information
 * 
 * @param {Buffer} minidumpBuffer - The raw minidump file content
 * @returns {Promise<Object>} - Extracted crash information
 */
async function parseMinidump(minidumpBuffer) {
  try {
    // Process the minidump to get stack traces
    const stackWalkResult = await walkStackAsync(minidumpBuffer);
    
    // Parse the text output from minidump-stackwalk
    const stackInfo = parseStackWalkOutput(stackWalkResult);

    return {
      crashReason: stackInfo.crashReason || 'Unknown crash',
      crashAddress: stackInfo.crashAddress,
      threadCrashed: stackInfo.threadCrashed,
      stackTraces: stackInfo.stackTraces,
      modules: stackInfo.modules,
      systemInfo: stackInfo.systemInfo
    };
  } catch (error) {
    console.error('Error parsing minidump:', error);
    throw new Error(`Failed to parse minidump: ${error.message}`);
  }
}

/**
 * Parses the text output from minidump-stackwalk
 * 
 * @param {string} output - The output from minidump-stackwalk
 * @returns {Object} - Structured crash information
 */
function parseStackWalkOutput(output) {
  const result = {
    crashReason: null,
    crashAddress: null,
    threadCrashed: null,
    stackTraces: [],
    modules: [],
    systemInfo: {}
  };

  // Split the output into lines
  const lines = output.toString().split('\\n');
  
  // Basic parser for demonstration - in a real implementation,
  // this would need to be more robust and handle all minidump-stackwalk output formats
  let currentSection = null;
  let currentThread = null;
  let currentFrame = null;

  for (const line of lines) {
    // Parse crash reason
    const crashMatch = line.match(/Crash reason: (.*)/);
    if (crashMatch) {
      result.crashReason = crashMatch[1];
      continue;
    }

    // Parse crash address
    const addressMatch = line.match(/Crash address: (0x[0-9a-fA-F]+)/);
    if (addressMatch) {
      result.crashAddress = addressMatch[1];
      continue;
    }

    // Parse crashing thread
    const threadMatch = line.match(/Thread ([0-9]+) \\(crashed\\)/);
    if (threadMatch) {
      result.threadCrashed = parseInt(threadMatch[1], 10);
      currentThread = result.threadCrashed;
      continue;
    }

    // Parse stack frames
    const frameMatch = line.match(/([0-9]+) (0x[0-9a-fA-F]+) (.*)/);
    if (frameMatch && currentThread !== null) {
      currentFrame = {
        frameIndex: parseInt(frameMatch[1], 10),
        address: frameMatch[2],
        function: frameMatch[3] || 'unknown',
        file: null,
        line: null
      };
      
      // Parse file and line info if available
      const fileLineMatch = frameMatch[3].match(/(.*) \\[(.*):(\\d+)\\]/);
      if (fileLineMatch) {
        currentFrame.function = fileLineMatch[1];
        currentFrame.file = fileLineMatch[2];
        currentFrame.line = parseInt(fileLineMatch[3], 10);
      }
      
      if (!result.stackTraces[currentThread]) {
        result.stackTraces[currentThread] = [];
      }
      
      result.stackTraces[currentThread].push(currentFrame);
      continue;
    }

    // Parse modules
    if (line.startsWith('Module')) {
      const moduleMatch = line.match(/Module (\\w+) ([^ ]+) ([^ ]+) \\(([^)]+)\\)/);
      if (moduleMatch) {
        result.modules.push({
          index: moduleMatch[1],
          name: moduleMatch[2],
          version: moduleMatch[3],
          debugId: moduleMatch[4]
        });
      }
      continue;
    }

    // Parse system info (simple approach)
    if (line.includes(':') && !line.startsWith(' ')) {
      const parts = line.split(':').map(p => p.trim());
      if (parts.length >= 2) {
        const key = parts[0];
        const value = parts.slice(1).join(':');
        result.systemInfo[key] = value;
      }
    }
  }

  return result;
}

module.exports = {
  parseMinidump
};