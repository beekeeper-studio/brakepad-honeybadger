/**
 * Debug script - To be run directly with Node
 * Generates a properly formatted multipart form and checks if busboy can parse it correctly
 */

const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

// Create test directory if it doesn't exist
const testDir = path.join(__dirname, 'test-output');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Sample metadata
const SAMPLE_METADATA = {
  product: 'TestElectronApp',
  version: '1.0.0',
  guid: 'test-guid-1234',
  timestamp: new Date().toISOString(),
  custom_key: 'custom_value'
};

// Create a boundary for the multipart form
const boundary = '---MultipartBoundary-TestBoundary---';

console.log('Creating test multipart form data...');

// Construct form data
let formData = '';

// Add metadata fields
for (const [key, value] of Object.entries(SAMPLE_METADATA)) {
  formData += `--${boundary}\r\n`;
  formData += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
  formData += `${value}\r\n`;
}

// Add the minidump file
formData += `--${boundary}\r\n`;
formData += `Content-Disposition: form-data; name="upload_file_minidump"; filename="minidump.dmp"\r\n`;
formData += `Content-Type: application/octet-stream\r\n\r\n`;

// Create sample minidump data
const minidumpData = Buffer.from(
  'MDMP' +                     // Magic number
  '\x93\x0A\x00\x00' +         // Version
  '\x08\x00\x00\x00' +         // Stream count
  'Crash reason: SIGSEGV\n' +  // Something for the parser to find
  'Crash address: 0x00000000\n' +
  'Thread 0 (crashed)\n' +
  '0 0x00000001 main\n' +
  '1 0x00000002 start [app.js:10]\n' +
  'Module 0 test.exe test-version (debug-id)'
);

// Add the form closing boundary
const formFooter = `\r\n--${boundary}--\r\n`;

// Combine all parts
const fullForm = Buffer.concat([
  Buffer.from(formData, 'utf8'),
  minidumpData,
  Buffer.from(formFooter, 'utf8')
]);

// Write the raw form data to a file for inspection
const rawFormPath = path.join(testDir, 'raw-form.txt');
fs.writeFileSync(rawFormPath, fullForm);
console.log(`Raw form data saved to ${rawFormPath}`);

// Create a mock request to parse with busboy
const req = new Readable();
req.push(fullForm);
req.push(null); // End the stream

// Set headers
req.headers = {
  'content-type': `multipart/form-data; boundary=${boundary}`
};

console.log('Testing busboy form parsing...');

// Create a busboy instance
const busboy = Busboy({
  headers: req.headers,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB file size limit
    files: 1,                   // Only expect one file
    fields: 100                 // Allow up to 100 fields
  }
});

// Track parsing success
let parsingSuccessful = false;
const formData2 = {
  fields: {},
  files: {}
};

// Set up busboy events
busboy.on('field', (fieldname, value) => {
  console.log(`Field received: ${fieldname} = ${value}`);
  formData2.fields[fieldname] = value;
});

busboy.on('file', (fieldname, file, info) => {
  const { filename, encoding, mimeType } = info;
  console.log(`File received: ${fieldname}, filename: ${filename}`);
  
  const chunks = [];
  
  file.on('data', (data) => {
    chunks.push(data);
    console.log(`Received chunk of size: ${data.length}`);
  });
  
  file.on('end', () => {
    const fileContent = Buffer.concat(chunks);
    console.log(`File ${fieldname} complete, size: ${fileContent.length} bytes`);
    
    formData2.files[fieldname] = {
      filename,
      content: fileContent,
      encoding,
      mimeType
    };
    
    // Save file for inspection
    const filePath = path.join(testDir, `${fieldname}-${Date.now()}.dmp`);
    fs.writeFileSync(filePath, fileContent);
    console.log(`Minidump file saved to ${filePath}`);
  });
});

busboy.on('finish', () => {
  console.log('Busboy finished parsing form');
  console.log('Parsed fields:', Object.keys(formData2.fields));
  console.log('Parsed files:', Object.keys(formData2.files));
  
  if (formData2.files.upload_file_minidump) {
    console.log('Successfully parsed minidump file!');
    
    // Check if all expected metadata fields were parsed
    let allMetadataFound = true;
    for (const key of Object.keys(SAMPLE_METADATA)) {
      if (!formData2.fields[key]) {
        console.error(`Missing metadata field: ${key}`);
        allMetadataFound = false;
      }
    }
    
    if (allMetadataFound) {
      console.log('All metadata fields successfully parsed!');
      parsingSuccessful = true;
    }
  } else {
    console.error('Failed to parse minidump file');
  }
  
  // Save parsing results
  const resultsPath = path.join(testDir, 'parse-results.json');
  fs.writeFileSync(
    resultsPath, 
    JSON.stringify({
      success: parsingSuccessful,
      fields: formData2.fields,
      files: Object.keys(formData2.files).reduce((acc, key) => {
        const file = formData2.files[key];
        acc[key] = {
          filename: file.filename,
          size: file.content.length,
          encoding: file.encoding,
          mimeType: file.mimeType
        };
        return acc;
      }, {})
    }, null, 2)
  );
  
  console.log(`Parse results saved to ${resultsPath}`);
  console.log(`Test ${parsingSuccessful ? 'PASSED' : 'FAILED'}`);
});

busboy.on('error', (error) => {
  console.error('Busboy parsing error:', error);
});

// Start parsing
console.log('Starting busboy parsing...');
req.pipe(busboy);