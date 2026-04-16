/**
 * Handler for parsing Breakpad/Crashpad crash reports
 */
const Busboy = require('busboy');
const { parseMinidump } = require('../services/minidumpService');

/**
 * Parses the multipart/form-data request containing the crash report
 * 
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} - Parsed crash report data
 */
async function parseCrashReport(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || req.headers['Content-Type'];
    
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return reject(new Error('Content-Type must be multipart/form-data'));
    }

    console.log("Processing multipart request with content type:", contentType);

    try {
      // Parse the multipart form data with proper configuration
      const busboy = Busboy({ 
        headers: req.headers,
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB file size limit
          files: 1,                   // Only expect one file
          fields: 100                 // Allow up to 100 fields
        }
      });
      
      const formData = {
        fields: {},
        files: {}
      };
      
      let busboyFinished = false;
      let parsingTimeout = null;
      const finalize = (err, value) => {
        if (parsingTimeout) {
          clearTimeout(parsingTimeout);
          parsingTimeout = null;
        }
        if (err) {
          reject(err);
        } else {
          resolve(value);
        }
      };

      busboy.on('field', (fieldname, value) => {
        console.log(`Field received: ${fieldname}`);
        formData.fields[fieldname] = value;
      });

      busboy.on('file', (fieldname, file, info) => {
        const { filename, encoding, mimeType } = info;
        console.log(`File received: ${fieldname}, filename: ${filename}`);
        const chunks = [];

        file.on('data', (data) => {
          chunks.push(data);
        });

        file.on('end', () => {
          const fileInfo = {
            filename: filename,
            content: Buffer.concat(chunks),
            encoding: encoding,
            mimeType: mimeType
          };
          console.log(`File ${fieldname} complete, size: ${fileInfo.content.length} bytes`);
          formData.files[fieldname] = fileInfo;
        });

        file.on('error', (error) => {
          console.error(`Error processing file ${fieldname}:`, error);
          finalize(new Error(`File processing error: ${error.message}`));
        });
      });

      busboy.on('finish', async () => {
        busboyFinished = true;
        console.log("Busboy finished parsing form data");

        try {
          // Process the minidump file
          if (!formData.files.upload_file_minidump) {
            return finalize(new Error('Missing minidump file'));
          }

          console.log("Processing minidump file");
          // Extract stack traces and other information from the minidump.
          // Pass form fields so the minidump service can fetch symbols for
          // the correct Electron version/platform/arch.
          const minidumpData = await parseMinidump(
            formData.files.upload_file_minidump.content,
            formData.fields
          );

          // Create the final crash report object
          const crashReport = {
            // Metadata from the form fields
            metadata: formData.fields,
            // Crash information from the minidump
            crash: minidumpData,
            // Raw minidump info for reference if needed
            rawMinidump: {
              filename: formData.files.upload_file_minidump.filename,
              size: formData.files.upload_file_minidump.content.length
            }
          };

          console.log("Crash report processed successfully");
          finalize(null, crashReport);
        } catch (error) {
          console.error("Error processing minidump:", error);
          finalize(error);
        }
      });

      busboy.on('error', (error) => {
        console.error('Busboy error:', error);
        finalize(error);
      });

      // Handle request stream data directly
      if (req.readable) {
        // If request already has body buffer (e.g., from body-parser), process it directly
        if (req.body && Buffer.isBuffer(req.body)) {
          busboy.end(req.body);
        } else if (req.rawBody) {
          // Some frameworks use rawBody for the binary data
          busboy.end(req.rawBody);
        } else {
          console.log("Piping request to busboy");
          req.pipe(busboy);
        }
      } else {
        console.error("Request is not readable");
        return finalize(new Error('Request is not a readable stream'));
      }

      // Set a timeout for the entire parsing operation
      parsingTimeout = setTimeout(() => {
        if (!busboyFinished) {
          console.error("Form parsing timed out");
          finalize(new Error('Form parsing timed out'));
        }
      }, 30000); // 30 seconds timeout

    } catch (error) {
      console.error("Error initializing busboy:", error);
      finalize(error);
    }
  });
}

module.exports = {
  parseCrashReport
};