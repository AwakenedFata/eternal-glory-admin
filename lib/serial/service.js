import crypto from "crypto";
import dbConnect from "@/lib/db/mongoose";
import { Serial } from "@/lib/db/models";

// Use environment variables for secrets, fallback only in development
const HMAC_SECRET = process.env.SERIAL_HMAC_SECRET || "fallback_hmac_secret_do_not_use_in_prod";
const ENCRYPTION_KEY = process.env.SERIAL_ENCRYPTION_KEY || "12345678901234567890123456789012"; // 32 bytes

if (!process.env.SERIAL_HMAC_SECRET || !process.env.SERIAL_ENCRYPTION_KEY) {
  console.warn("WARNING: Using fallback secrets for Serial generation. Define SERIAL_HMAC_SECRET and SERIAL_ENCRYPTION_KEY (32 chars) in .env");
}

export function generateSecure6DigitCode() {
  const num = crypto.randomInt(0, 1000000); // 0 to 999999
  return num.toString().padStart(6, "0");
}

export function hashCode(code) {
  return crypto.createHmac("sha256", HMAC_SECRET).update(code).digest("hex");
}

export function encryptCode(code) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(code, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decryptCode(encryptedData) {
  try {
    const [ivHex, encryptedHex] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    return null;
  }
}

export async function generateSingleSerial(source = "MANUAL_SINGLE") {
  await dbConnect();
  
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    const code = generateSecure6DigitCode();
    const codeHash = hashCode(code);
    
    // Check collision
    const existing = await Serial.findOne({ codeHash });
    if (existing) continue;

    const encryptedCode = encryptCode(code);
    const serial = await Serial.create({
      codeHash,
      encryptedCode,
      source,
      status: "AVAILABLE",
    });

    return { serial, plainCode: code };
  }
  throw new Error("Failed to generate unique serial after multiple retries");
}

export async function generateBatchSerials(quantity, source = "MANUAL_BATCH") {
  await dbConnect();
  
  if (quantity > 10000) {
    throw new Error("Batch size too large. Maximum is 10000.");
  }

  const generatedCodes = new Set();
  const serialsToInsert = [];
  
  // Pre-generate unique codes
  while (generatedCodes.size < quantity) {
    const code = generateSecure6DigitCode();
    if (!generatedCodes.has(code)) {
      generatedCodes.add(code);
    }
  }

  const codesArray = Array.from(generatedCodes);
  
  // We need to check database for existing hashes in chunks to prevent memory issues
  const chunkSize = 1000;
  for (let i = 0; i < codesArray.length; i += chunkSize) {
    const chunk = codesArray.slice(i, i + chunkSize);
    const hashes = chunk.map(hashCode);
    
    const existing = await Serial.find({ codeHash: { $in: hashes } }, { codeHash: 1 });
    const existingHashes = new Set(existing.map(e => e.codeHash));
    
    for (const code of chunk) {
      const hash = hashCode(code);
      if (!existingHashes.has(hash)) {
        serialsToInsert.push({
          codeHash: hash,
          encryptedCode: encryptCode(code),
          source,
          status: "AVAILABLE",
        });
      }
    }
  }

  // Insert the non-colliding ones
  if (serialsToInsert.length > 0) {
    await Serial.insertMany(serialsToInsert, { ordered: false });
  }

  return {
    requested: quantity,
    generated: serialsToInsert.length,
    collisions: quantity - serialsToInsert.length
  };
}

export async function generateWebhookSerials({ 
  quantity, 
  storeId, 
  externalOrderId, 
  orderItemId, 
  channel = "MARKETPLACE", 
  provider = "WEBHOOK", 
  orderRef = null,
  integrationId,
  productId,
  sku,
  serialsPerUnit
}) {
  await dbConnect();
  const mongoose = (await import("mongoose")).default;
  const { MarketplaceOrderAllocation } = await import("@/lib/db/models");

  // 1. Fetch existing allocations for this order item
  const existingAllocations = await MarketplaceOrderAllocation.find({
    integrationId,
    externalOrderId,
    externalOrderItemId: orderItemId,
  }).populate("serialId");

  const allocatedSerials = [];
  const existingMap = new Map();
  for (const alloc of existingAllocations) {
    if (alloc.serialId) {
      existingMap.set(alloc.allocationSequence, alloc);
      allocatedSerials.push(alloc.serialId);
    } else {
      // Broken allocation (serial was not created due to crash in standalone mode)
      // Delete it so it can be cleanly regenerated
      await MarketplaceOrderAllocation.findByIdAndDelete(alloc._id);
    }
  }

  // 2. Identify which sequences are missing
  const missingSequences = [];
  for (let i = 1; i <= quantity; i++) {
    if (!existingMap.has(i)) {
      missingSequences.push(i);
    }
  }

  if (missingSequences.length === 0) {
    return allocatedSerials;
  }

  // 3. Generate serials only for the missing sequences
  for (const sequence of missingSequences) {
    let success = false;
    let attempts = 0;
    while (!success && attempts < 10) {
      attempts++;
      const code = generateSecure6DigitCode();
      const codeHashValue = hashCode(code);
      
      const existingSerial = await Serial.findOne({ codeHash: codeHashValue });
      if (existingSerial) continue;

      const serialId = new mongoose.Types.ObjectId();
      
      // We use a transaction if possible, fallback to sequential if standalone
      let session = null;
      try {
        session = await mongoose.startSession();
        session.startTransaction();
      } catch (err) {
        // Transactions not supported (e.g. standalone Mongo)
        session = null; 
      }

      let allocation;
      try {
        // Attempt allocation first (determines business integrity)
        allocation = new MarketplaceOrderAllocation({
          integrationId,
          provider,
          storeId,
          externalOrderId,
          externalOrderItemId: orderItemId,
          serialId,
          productId,
          sku,
          quantity,
          serialsPerUnit,
          allocationSequence: sequence,
        });
        await allocation.save({ session });

        // Then create serial
        const serial = new Serial({
          _id: serialId,
          codeHash: codeHashValue,
          encryptedCode: encryptCode(code),
          source: "WEBHOOK",
          status: "ASSIGNED",
          storeId,
          externalOrderId,
          orderItemId,
          allocatedAt: new Date(),
          assignment: {
            channel,
            orderRef: orderRef || externalOrderId,
            customerRef: null,
            assignedAt: new Date(),
            assignedBy: "SYSTEM"
          }
        });
        await serial.save({ session });

        if (session) {
          await session.commitTransaction();
          session.endSession();
        }

        allocatedSerials.push(serial);
        success = true;

      } catch (err) {
        if (session) {
          await session.abortTransaction();
          session.endSession();
        }

        // Duplicate key on allocation -> someone else grabbed this sequence or code collision
        if (err.code === 11000) {
          if (err.message && err.message.includes("MarketplaceOrderAllocation")) {
            // Collision is on allocation, handled by concurrent worker
            const allocExists = await MarketplaceOrderAllocation.findOne({
              integrationId, externalOrderId, externalOrderItemId: orderItemId, allocationSequence: sequence
            }).populate("serialId");
            
            if (allocExists && allocExists.serialId && !allocatedSerials.some(s => s._id.equals(allocExists.serialId._id))) {
              allocatedSerials.push(allocExists.serialId);
            }
            success = true; // Stop trying to allocate this sequence
            break;
          } else {
            // It was a serial code collision
            // We need to clean up the allocation we just made if we are in standalone mode (no transaction)
            if (!session) {
              await MarketplaceOrderAllocation.deleteOne({ _id: allocation._id });
            }
            continue; // Retry generating a new code
          }
        }
        
        throw err;
      }
    }
    
    if (!success) {
      throw new Error(`Failed to generate and allocate serial for sequence ${sequence}`);
    }
  }

  return allocatedSerials;
}

export async function cleanupOrphanWebhookSerials() {
  await dbConnect();
  
  // Find serials that have source WEBHOOK, status AVAILABLE, and were created over 10 minutes ago
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  
  const orphans = await Serial.find({
    source: "WEBHOOK",
    status: "AVAILABLE",
    createdAt: { $lt: tenMinutesAgo }
  });
  
  const deletedIds = [];
  for (const serial of orphans) {
    // Double check if there is an allocation pointing to this serial
    const { MarketplaceOrderAllocation } = await import("@/lib/db/models");
    const allocation = await MarketplaceOrderAllocation.findOne({ serialId: serial._id });
    
    if (!allocation) {
      await Serial.deleteOne({ _id: serial._id });
      deletedIds.push(serial._id);
    }
  }
  
  return deletedIds;
}
