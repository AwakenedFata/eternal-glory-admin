const fs = require('fs');
const content = \import { NextResponse } from 'next/server';
import { generateCertificatePDF } from '@/lib/certificates/generator';
import crypto from 'crypto';

export async function GET(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'cold';
  const concurrent = url.searchParams.get('concurrent') === 'true';

  const dummyId = crypto.randomUUID();
  const serialCode = 'PERF-' + Date.now();
  const issuedAt = new Date();
  const location = { displayName: 'Performance City' };
  
  if (concurrent) {
      console.log('Starting concurrent tests (2 jobs)...');
      const start = Date.now();
      const p1 = generateCertificatePDF(serialCode + '-1', dummyId + '-1', issuedAt, location, 'UTC');
      const p2 = generateCertificatePDF(serialCode + '-2', dummyId + '-2', issuedAt, location, 'UTC');
      
      const [res1, res2] = await Promise.all([p1, p2]);
      
      return NextResponse.json({
          concurrent: true,
          totalMs: Date.now() - start,
          res1Size: res1.fileSize,
          res2Size: res2.fileSize,
          res1Sha: res1.pdfSha256,
          res2Sha: res2.pdfSha256
      });
  }

  // Single test
  console.log(\\\Starting \\\ test...\\\);
  
  const times = {};
  const origTime = console.time;
  const origTimeEnd = console.timeEnd;
  
  console.time = (label) => {
      times[label] = { start: process.hrtime.bigint() };
      origTime(label);
  };
  
  console.timeEnd = (label) => {
      if (times[label]) {
          const end = process.hrtime.bigint();
          times[label].durationMs = Number(end - times[label].start) / 1000000;
      }
      origTimeEnd(label);
  };
  
  const totalStart = Date.now();
  const res = await generateCertificatePDF(serialCode, dummyId, issuedAt, location, 'UTC');
  const totalMs = Date.now() - totalStart;
  
  console.time = origTime;
  console.timeEnd = origTimeEnd;

  return NextResponse.json({
      type,
      totalMs,
      pageContentMs: times['pageContent']?.durationMs || 0,
      pagePdfMs: times['pagePdf']?.durationMs || 0,
      fileSize: res.fileSize,
      sha256: res.pdfSha256
  });
}\;
fs.writeFileSync('d:/eternal-glory-admin/app/api/benchmark/route.js', content);
