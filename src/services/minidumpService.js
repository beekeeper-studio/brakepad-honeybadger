/**
 * Service for processing minidump files from Breakpad/Crashpad
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const minidump = require('minidump');

// minidump.walkStack(filePath, [symbolPaths,] callback) takes a file path,
// not a buffer, so callers that have a Buffer must spill it to a temp file.
const walkStackAsync = promisify(minidump.walkStack);

/**
 * Parses a minidump file to extract crash information
 *
 * @param {Buffer} minidumpBuffer - The raw minidump file content
 * @returns {Promise<Object>} - Extracted crash information
 */
async function parseMinidump(minidumpBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'honeybadger-brakepad-'));
  const tmpPath = path.join(tmpDir, 'crash.dmp');

  try {
    fs.writeFileSync(tmpPath, minidumpBuffer);

    const stackWalkResult = await walkStackAsync(tmpPath, []);
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
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('Failed to clean up minidump temp dir:', cleanupErr.message);
    }
  }
}

/**
 * Parses the text output from minidump-stackwalk
 *
 * @param {string|Buffer} output - The output from minidump-stackwalk
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

  const lines = output.toString().split('\n');

  let currentThread = null;

  for (const line of lines) {
    // Crash reason
    const crashMatch = line.match(/Crash reason:\s*(.*)/);
    if (crashMatch) {
      result.crashReason = crashMatch[1].trim();
      continue;
    }

    // Crash address
    const addressMatch = line.match(/Crash address:\s*(0x[0-9a-fA-F]+)/);
    if (addressMatch) {
      result.crashAddress = addressMatch[1];
      continue;
    }

    // Crashing thread header (e.g. "Thread 0 (crashed)")
    const threadMatch = line.match(/Thread\s+([0-9]+)\s+\(crashed\)/);
    if (threadMatch) {
      result.threadCrashed = parseInt(threadMatch[1], 10);
      currentThread = result.threadCrashed;
      continue;
    }

    // Stack frames - "0 0xADDR functionName" optionally followed by " [file:line]"
    const frameMatch = line.match(/^\s*([0-9]+)\s+(0x[0-9a-fA-F]+)\s+(.*)$/);
    if (frameMatch && currentThread !== null) {
      const frame = {
        frameIndex: parseInt(frameMatch[1], 10),
        address: frameMatch[2],
        function: (frameMatch[3] || 'unknown').trim(),
        file: null,
        line: null
      };

      const fileLineMatch = frame.function.match(/^(.*)\s+\[(.*):(\d+)\]\s*$/);
      if (fileLineMatch) {
        frame.function = fileLineMatch[1].trim();
        frame.file = fileLineMatch[2];
        frame.line = parseInt(fileLineMatch[3], 10);
      }

      if (!result.stackTraces[currentThread]) {
        result.stackTraces[currentThread] = [];
      }

      result.stackTraces[currentThread].push(frame);
      continue;
    }

    // Modules - "Module <index> <name> <version> (<debugId>)"
    if (line.startsWith('Module')) {
      const moduleMatch = line.match(/Module\s+(\S+)\s+(\S+)\s+(\S+)\s+\(([^)]+)\)/);
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

    // Generic key/value system info
    if (line.includes(':') && !line.startsWith(' ')) {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && value && !result.systemInfo[key]) {
        result.systemInfo[key] = value;
      }
    }
  }

  return result;
}

module.exports = {
  parseMinidump,
  parseStackWalkOutput
};
