import crypto from 'crypto';

async function testA() {
    const generator = await import('./lib/certificates/generator.js');
    const { generateCertificatePDF, __getBrowserForTesting } = generator;
    
    const issuedAt = new Date();
    const location = { displayName: 'Crash Test City' };
    
    console.log('--- TEST A: BROWSER DISCONNECT RECOVERY ---');
    console.log('1. Generate Certificate A...');
    await generateCertificatePDF('TEST-A-' + Date.now(), crypto.randomUUID(), issuedAt, location, 'UTC');
    console.log('   Certificate A generated successfully.');
    
    console.log('2. Memastikan globalBrowser tersedia...');
    const browser1 = __getBrowserForTesting();
    if (!browser1) throw new Error("globalBrowser is null!");
    const pid1 = browser1.process().pid;
    console.log(`   globalBrowser tersedia (PID: ${pid1}).`);
    
    console.log('3. Force actual browser disconnect (Kill Chromium process)...');
    process.kill(pid1, 'SIGKILL');
    
    // Wait a moment for OS to process the kill and trigger 'disconnected'
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('4. Generate Certificate B (seharusnya memicu relaunch)...');
    await generateCertificatePDF('TEST-B-' + Date.now(), crypto.randomUUID(), issuedAt, location, 'UTC');
    console.log('5. Certificate B berhasil digenerate.');
    
    console.log('6. Pastikan browser baru benar-benar dibuat...');
    const browser2 = __getBrowserForTesting();
    if (!browser2) throw new Error("globalBrowser is null setelah B!");
    const pid2 = browser2.process().pid;
    console.log(`   globalBrowser baru tersedia (PID: ${pid2}).`);
    
    if (pid1 !== pid2) {
        console.log('>>> TEST A PASSED: PID berubah, menandakan instance Chromium baru berhasil direlaunch setelah crash!');
    } else {
        console.log('>>> TEST A FAILED: PID masih sama!');
    }
    
    process.exit(0);
}

testA().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
