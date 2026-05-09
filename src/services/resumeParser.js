const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { pathToFileURL } = require('url');

const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json');
const pdfjsRootDir = path.dirname(pdfjsPackagePath);
const standardFontDataUrl = pathToFileURL(
  path.join(pdfjsRootDir, 'standard_fonts', path.sep)
).href;

async function parseResume(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return await parsePdf(filePath);
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error('Unsupported file type');
}

async function parsePdf(filePath) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const dataBuffer = fs.readFileSync(filePath);
  const uint8Array = new Uint8Array(dataBuffer);

  const pdf = await getDocument({
    data: uint8Array,
    standardFontDataUrl,
  }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

module.exports = { parseResume };
