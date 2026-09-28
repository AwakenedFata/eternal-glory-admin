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
  const publicDir = path.join(process.cwd(), 'public', 'assets');
  const templatePath = path.join(publicDir, 'certificate.html');
  const imagePath = path.join(publicDir, 'certificate-w-o-text.png');

  let html = fs.readFileSync(templatePath, 'utf8');

  const imgBase64 = fs.readFileSync(imagePath).toString('base64');
  const imgDataUri = `data:image/png;base64,${imgBase64}`;

  html = html.replace(/url\(['"]?certificate-w-o-text\.png['"]?\)/g, `url('${imgDataUri}')`);

  const dateFormatted = issuedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const locationName = location && location.displayName ? location.displayName : "Unknown Location";

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

  html = html.replace(
    /<\/head>/i,
    `<style> body { padding: 0 !important; } .cert-wrap { max-width: none !important; } </style></head>`
  );

  let browser;
  try {
    if (process.env.VERCEL) {
      console.log("Using Sparticuz Chromium for Vercel...");
      const puppeteerCore = (await import('puppeteer-core')).default;
      const chromium = (await import('@sparticuz/chromium')).default;
      
      chromium.setGraphicsMode = false;
      
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    } else {
      console.log("Using local Puppeteer...");
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
    }

    const page = await browser.newPage();
    
    await page.setViewport({ width: 2382, height: 3368, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBufferBytes = await page.pdf({
      printBackground: true,
      width: '2382px',
      height: '3368px',
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1'
    });
    
    const pdfBuffer = Buffer.from(pdfBufferBytes);
    const pdfSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    return {
      pdfBuffer,
      pdfSha256,
      fileSize: pdfBuffer.length,
    };
  } catch (err) {
    console.error("PDF generation failed:", err);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
