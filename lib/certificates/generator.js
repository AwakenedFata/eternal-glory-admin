import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let globalBrowser = null;

async function getBrowser() {
  if (globalBrowser) {
    try {
      // Check if browser is still connected
      if (globalBrowser.isConnected()) {
        return globalBrowser;
      }
      console.warn("[PDF Generator] globalBrowser disconnected. Relaunching...");
      globalBrowser = null;
    } catch (e) {
      console.warn("[PDF Generator] globalBrowser crashed. Relaunching...", e);
      globalBrowser = null;
    }
  }

  if (process.env.VERCEL) {
    console.log("Using Sparticuz Chromium for Vercel...");
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
    const puppeteerCore = (await import('puppeteer-core')).default;
    const chromium = (await import('@sparticuz/chromium')).default;
    
    chromium.setGraphicsMode = false;
    
    globalBrowser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
  } else {
    console.log("Using local Puppeteer...");
    try {
      const puppeteer = (await import('puppeteer')).default;
      globalBrowser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (err) {
      console.warn("Puppeteer default launch failed, trying system Chrome...");
      const puppeteer = (await import('puppeteer')).default;
      globalBrowser = await puppeteer.launch({
        headless: "new",
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
  }

  // Handle unexpected disconnections
  globalBrowser.on('disconnected', () => {
    console.warn("[PDF Generator] Browser disconnected event fired.");
    globalBrowser = null;
  });

  return globalBrowser;
}

/**
 * Generates a PDF certificate by rendering the HTML template using Puppeteer.
 */
export async function generateCertificatePDF(serialCode, publicId, issuedAt, location, issuedTimezone) {
  const publicDir = path.join(process.cwd(), 'public', 'assets');
  const templatePath = path.join(publicDir, 'certificate.html');
  const imagePath = path.join(publicDir, 'certificate-w-o-text.png');
  const fontPath = path.join(publicDir, 'Inter-VariableFont_opsz,wght.ttf');

  let html = fs.readFileSync(templatePath, 'utf8');

  // Embed image
  const imgBase64 = fs.readFileSync(imagePath).toString('base64');
  const imgDataUri = `data:image/png;base64,${imgBase64}`;
  html = html.replace(/url\(['"]?certificate-w-o-text\.png['"]?\)/g, `url('${imgDataUri}')`);
  
  // Embed font if it exists to eliminate network font request
  if (fs.existsSync(fontPath)) {
      const fontBase64 = fs.readFileSync(fontPath).toString('base64');
      const fontDataUri = `data:font/ttf;base64,${fontBase64}`;
      // Replace external Google Fonts link with inline style
      html = html.replace(/<link[^>]+fonts\.googleapis\.com[^>]+>/i, '');
      html = html.replace(
          /<\/head>/i,
          `<style>
            @font-face {
              font-family: 'Inter';
              font-style: normal;
              font-weight: 100 900;
              font-display: swap;
              src: url('${fontDataUri}') format('truetype');
            }
            body { padding: 0 !important; }
            .cert-wrap { max-width: none !important; }
          </style></head>`
      );
  } else {
      html = html.replace(
        /<\/head>/i,
        `<style> body { padding: 0 !important; } .cert-wrap { max-width: none !important; } </style></head>`
      );
  }

  const dateOptions = { year: "numeric", month: "long", day: "numeric" };
  if (issuedTimezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: issuedTimezone });
      dateOptions.timeZone = issuedTimezone;
    } catch (e) {
      console.warn(`[PDF Generator] Invalid timezone fallback triggered for:`, issuedTimezone);
      dateOptions.timeZone = "UTC";
    }
  } else {
    dateOptions.timeZone = "UTC";
  }
  
  const dateFormatted = issuedAt.toLocaleDateString("en-US", dateOptions);
  const locationName = location && location.displayName ? location.displayName : "Unknown Location";

  const escapeHtml = (unsafe) => unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const safeSerial = escapeHtml(serialCode);
  const safeDate = escapeHtml(dateFormatted);
  const safeLocation = escapeHtml(locationName);

  html = html.replace(/<span class="num">dynamic<\/span>/g, `<span class="num">${safeSerial}</span>`);
  html = html.replace(/<p class="meta-line"><b>Issued on:<\/b> dynamic<\/p>/g, `<p class="meta-line"><b>Issued on:</b> ${safeDate}</p>`);
  html = html.replace(/<p class="meta-line"><b>Location:<\/b> dynamic<\/p>/g, `<p class="meta-line"><b>Location:</b> ${safeLocation}</p>`);

  const browser = await getBrowser();
  let page = null;
  
  try {
    page = await browser.newPage();
    
    await page.setViewport({ width: 2382, height: 3368, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' }); // Reduced from networkidle0 because assets are inline

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
    if (page && !page.isClosed()) {
      await page.close().catch(e => console.warn("Failed to close page:", e));
    }
  }
}

