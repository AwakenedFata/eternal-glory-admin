import puppeteer from 'puppeteer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Generates a PDF certificate by rendering the HTML template using Puppeteer.
 *
 * @param {string} serialCode - The verified serial code
 * @param {string} publicId - The certificate public ID
 * @param {Date} issuedAt - When the certificate was generated
 * @param {Object} location - Location snapshot { displayName }
 * @returns {Promise<{ pdfBuffer: Buffer, pdfSha256: string, fileSize: number }>}
 */
export async function generateCertificatePDF(serialCode, publicId, issuedAt, location) {
  const publicDir = path.resolve(process.cwd(), '../eternal-glory-public/public/assets');
  const templatePath = path.join(publicDir, 'certificate.html');
  const imagePath = path.join(publicDir, 'certificate-w-o-text.png');

  // Load HTML template
  let html = fs.readFileSync(templatePath, 'utf8');

  // Load Background Image as Base64 to make it portable and deterministic for Puppeteer
  const imgBase64 = fs.readFileSync(imagePath).toString('base64');
  const imgDataUri = `data:image/png;base64,${imgBase64}`;

  // Replace background image in CSS
  html = html.replace(/url\(['"]?certificate-w-o-text\.png['"]?\)/g, `url('${imgDataUri}')`);

  // Format Dates
  const dateFormatted = issuedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const locationName = location && location.displayName ? location.displayName : "Unknown Location";

  // Escape HTML entities to prevent XSS
  const escapeHtml = (unsafe) => {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const safeSerial = escapeHtml(serialCode);
  const safeDate = escapeHtml(dateFormatted);
  const safeLocation = escapeHtml(locationName);

  // Inject Dynamic Fields
  html = html.replace(
    /<span class="num">dynamic<\/span>/g,
    `<span class="num">${safeSerial}</span>`
  );
  
  html = html.replace(
    /<p class="meta-line"><b>Issued on:<\/b> dynamic<\/p>/g,
    `<p class="meta-line"><b>Issued on:</b> ${safeDate}</p>`
  );

  html = html.replace(
    /<p class="meta-line"><b>Location:<\/b> dynamic<\/p>/g,
    `<p class="meta-line"><b>Location:</b> ${safeLocation}</p>`
  );

  // Override max-width so the certificate scales to the full PDF page size
  html = html.replace(
    /<\/head>/i,
    `<style>
      body { padding: 0 !important; }
      .cert-wrap { max-width: none !important; }
    </style></head>`
  );

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (err) {
    console.warn("Puppeteer default launch failed, trying system Chrome...");
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  try {
    const page = await browser.newPage();
    
    // Certificate template specifies dimensions: aspect-ratio: 2382 / 3368
    // This is roughly equivalent to A4 portrait but slightly wider. We'll use viewport size to match it.
    await page.setViewport({ width: 2382, height: 3368, deviceScaleFactor: 1 });
    
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    // We want the PDF to be exactly the size of the certificate.
    // The `certificate.html` centers a `.cert-wrap` element of max-width: 560px.
    // However, for PDF printing, we want the certificate to fill the page, or we set printBackground: true
    const pdfBufferBytes = await page.pdf({
      printBackground: true,
      width: '2382px',
      height: '3368px',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1'
    });
    
    const pdfBuffer = Buffer.from(pdfBufferBytes);

    // Calculate SHA-256 hash
    const pdfSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    return {
      pdfBuffer,
      pdfSha256,
      fileSize: pdfBuffer.length,
    };
  } finally {
    await browser.close();
  }
}
