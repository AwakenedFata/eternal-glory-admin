const https = require('http'); // local is http
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

async function triggerWorker() {
  const workerSecret = process.env.CRON_SECRET || process.env.WEBHOOK_WORKER_SECRET;
  if (!workerSecret) {
    console.error("No CRON_SECRET or WEBHOOK_WORKER_SECRET found in .env");
    process.exit(1);
  }
  console.log("Triggering worker...");
  
  try {
    const res = await fetch("http://localhost:3000/api/admin/webhooks/worker", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${workerSecret}`,
        "Content-Type": "application/json"
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      console.log("Worker triggered successfully:", data);
    } else {
      const errorText = await res.text();
      console.error(`Worker failed with status ${res.status}:`, errorText);
    }
  } catch (err) {
    console.error("Fetch failed:", err.message);
  }
}

triggerWorker();
