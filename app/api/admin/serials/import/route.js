import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/db/mongoose";
import { Serial, AuditLog } from "@/lib/db/models";
import { hashCode, encryptCode } from "@/lib/serial/service";

export async function POST(req) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  
  const formData = await req.formData();
  const file = formData.get("file");
  const confirm = formData.get("confirm") === "true";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) { // 10MB limit
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/);
  
  // Find header
  const headerIndex = lines.findIndex(l => l.trim().toLowerCase() === "code");
  if (headerIndex === -1) {
    return NextResponse.json({ error: "Invalid format. Expected header 'code'." }, { status: 400 });
  }

  const codeLines = lines.slice(headerIndex + 1);
  const validCodes = [];
  let invalidCount = 0;
  
  for (const line of codeLines) {
    const code = line.trim();
    if (!code) continue;
    
    // Exactly 6 digits
    if (/^\d{6}$/.test(code)) {
      validCodes.push(code);
    } else {
      invalidCount++;
    }
  }

  // Check duplicates inside CSV
  const codeSet = new Set();
  let duplicateInFileCount = 0;
  for (const c of validCodes) {
    if (codeSet.has(c)) {
      duplicateInFileCount++;
    } else {
      codeSet.add(c);
    }
  }

  const uniqueValidCodes = Array.from(codeSet);
  
  // Check duplicates in DB
  const hashes = uniqueValidCodes.map(hashCode);
  const existingInDb = await Serial.find({ codeHash: { $in: hashes } }, { codeHash: 1 });
  const existingHashesSet = new Set(existingInDb.map(e => e.codeHash));
  
  const toInsertCodes = [];
  let alreadyExistingCount = 0;

  for (const code of uniqueValidCodes) {
    const hash = hashCode(code);
    if (existingHashesSet.has(hash)) {
      alreadyExistingCount++;
    } else {
      toInsertCodes.push(code);
    }
  }

  const summary = {
    totalRows: codeLines.filter(l => l.trim()).length,
    valid: uniqueValidCodes.length,
    invalid: invalidCount,
    duplicateInFile: duplicateInFileCount,
    alreadyExisting: alreadyExistingCount,
    readyToImport: toInsertCodes.length
  };

  if (!confirm) {
    // Just preview mode
    return NextResponse.json({ success: true, preview: true, summary });
  }

  // Perform actual import
  const docs = toInsertCodes.map(code => ({
    codeHash: hashCode(code),
    encryptedCode: encryptCode(code),
    source: "CSV_IMPORT",
    status: "AVAILABLE",
  }));

  if (docs.length > 0) {
    await Serial.insertMany(docs, { ordered: false });
    await AuditLog.create({
      adminEmail: session.user.email,
      action: "CSV_IMPORT_SERIALS",
      targetType: "SERIAL",
      metadata: { summary, imported: docs.length },
    });
  }

  return NextResponse.json({ success: true, summary, importedCount: docs.length });
}
