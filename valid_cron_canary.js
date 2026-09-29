const crypto = require('crypto');
const ENCRYPTION_KEY = 'EternalGlory2026SecureKey32Chars';

function encryptCode(code) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(code, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

const mongoose = require('mongoose');

async function runCronCanary() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect('mongodb+srv://noroinoogmg_db_user:R32dljwv3Zn5Y2gO@eternalglory.bpzxicx.mongodb.net/?appName=eternalglory');

    const certSchema = new mongoose.Schema({
        publicId: String,
        status: String,
        serialId: mongoose.Schema.Types.ObjectId,
        generationVersion: Number,
        workerId: String,
        leaseExpiresAt: Date,
        history: Array,
        pdfUrl: String
    }, { collection: 'certificates' });
    const Certificate = mongoose.models.Certificate || mongoose.model('Certificate', certSchema);

    const serialSchema = new mongoose.Schema({
        encryptedCode: String,
        status: String,
        codeHash: String
    }, { collection: 'serials' });
    const Serial = mongoose.models.Serial || mongoose.model('Serial', serialSchema);

    const dummyId = require('crypto').randomUUID();
    
    console.log('Inserting a dummy serial...');
    const rawCode = 'CRN' + Date.now();
    const dummySerial = await Serial.create({
        encryptedCode: encryptCode(rawCode),
        codeHash: 'hash' + Date.now(),
        status: 'CLAIMED'
    });
    
    console.log('Inserting stranded PROCESSING certificate...');
    await Certificate.create({
        publicId: dummyId,
        serialId: dummySerial._id,
        status: 'PROCESSING',
        generationVersion: 1, 
        workerId: null,
        leaseExpiresAt: null,
        history: [{ status: 'PROCESSING', timestamp: new Date() }]
    });

    console.log('Certificate inserted. Calling Cron endpoint...');
    
    const start = Date.now();
    const res = await fetch('http://localhost:3001/api/worker/certificates', {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer test_cron_secret'
        }
    });

    const body = await res.text();
    console.log('Cron response (' + res.status + '): ' + body);

    console.log('Waiting 10 seconds for generation to complete...');
    await new Promise(r => setTimeout(r, 10000));

    const finalCert = await Certificate.findOne({ publicId: dummyId });
    console.log('Final Certificate Status: ' + finalCert.status);
    if (finalCert.status === 'READY') {
        console.log('CRON CANARY PASSED! Worker picked it up and rendered the PDF.');
        console.log('PDF URL: ' + finalCert.pdfUrl);
    } else {
        console.log('CRON CANARY FAILED!');
        console.log(finalCert);
    }

    mongoose.disconnect();
}

runCronCanary().catch(console.error);
