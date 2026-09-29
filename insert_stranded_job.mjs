import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const ENCRYPTION_KEY = process.env.SERIAL_ENCRYPTION_KEY;

function encryptCode(code) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(code, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function run() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    const certSchema = new mongoose.Schema({
        publicId: String,
        status: String,
        serialId: mongoose.Schema.Types.ObjectId,
        generationVersion: Number,
        workerId: String,
        leaseExpiresAt: Date,
        history: Array,
        pdfUrl: String,
        issuedAt: Date,
        location: Object
    }, { collection: 'certificates', strict: false });
    const Certificate = mongoose.models.Certificate || mongoose.model('Certificate', certSchema);

    const serialSchema = new mongoose.Schema({
        encryptedCode: String,
        status: String,
        codeHash: String
    }, { collection: 'serials' });
    const Serial = mongoose.models.Serial || mongoose.model('Serial', serialSchema);

    const dummyId = crypto.randomUUID();
    
    console.log('1. Inserting a VALID Dummy Serial...');
    const rawCode = 'CRON-' + Date.now();
    const dummySerial = await Serial.create({
        encryptedCode: encryptCode(rawCode),
        status: 'CLAIMED',
        codeHash: crypto.createHash('sha256').update(rawCode).digest('hex')
    });
    
    console.log('2. Inserting stranded PROCESSING certificate...');
    await Certificate.create({
        publicId: dummyId,
        serialId: dummySerial._id,
        status: 'PROCESSING',
        generationVersion: 1, 
        workerId: null,
        leaseExpiresAt: null,
        issuedAt: new Date(),
        location: { displayName: 'Production Cron Canary' },
        history: [{ status: 'PROCESSING', timestamp: new Date() }]
    });

    console.log('\n======================================================');
    console.log(' STRANDED JOB BERHASIL DIBUAT!');
    console.log(` Public ID : ${dummyId}`);
    console.log(` Serial    : ${rawCode}`);
    console.log('======================================================');
    console.log('Silakan deploy aplikasi ke Vercel dan tunggu cron berjalan.');
    console.log('Vercel Cron akan secara otomatis mengubah statusnya menjadi READY.');
    
    mongoose.disconnect();
}

run().catch(console.error);
