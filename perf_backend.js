require('dotenv').config();
const { executeCertificateGenerationJob, processCertificateGeneration } = require('./lib/certificates/service');

async function run() {
  const serialCode = "TEST-112233";
  console.log("Creating dummy certificate...");
  
  const { certificate } = await processCertificateGeneration("dummy-id-123", serialCode);
  
  console.log("Running generation 1...");
  console.time("Generation 1");
  await executeCertificateGenerationJob(certificate._id, serialCode, "worker-1", certificate.generationVersion);
  console.timeEnd("Generation 1");

  console.log("Running generation 2 (should hit cache)...");
  console.time("Generation 2");
  await executeCertificateGenerationJob(certificate._id, serialCode, "worker-2", certificate.generationVersion);
  console.timeEnd("Generation 2");
  
  process.exit(0);
}

run().catch(console.error);
