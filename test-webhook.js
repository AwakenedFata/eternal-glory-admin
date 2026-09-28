import dbConnect from "./lib/db/mongoose.js";
import { StoreWebhookIntegration, ProductRule } from "./lib/db/models.js";
import mongoose from "mongoose";

async function run() {
  await dbConnect();
  
  // Create mock integration
  const integration = await StoreWebhookIntegration.create({
    storeId: new mongoose.Types.ObjectId(), // Fake store ID
    provider: "MOCK",
    name: "Mock Integration",
    endpointKey: "test-endpoint-key",
    isActive: true,
  });

  // Create product rule
  await ProductRule.create({
    integrationId: integration._id,
    providerProductId: "ITEM_1",
    sku: "EG-TEST",
    isEligible: true,
    serialsPerUnit: 1
  });

  console.log("Created integration and rule. Endpoint key:", integration.endpointKey);
  
  const payload = {
    mockEventId: "evt_123456",
    mockEventType: "ORDER_PAID",
    storeId: "MOCK_STORE",
    order: {
      id: "TEST-001",
      orderNumber: "ORD-TEST-001",
      currency: "IDR",
      items: [
        {
          id: "ITEM_1",
          sku: "EG-TEST",
          productId: "PROD_1",
          name: "Test Product",
          quantity: 3
        }
      ]
    }
  };

  const response = await fetch(`http://localhost:3001/api/webhooks/mock/test-endpoint-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  console.log("Response:", response.status, text);

  // Exit
  process.exit(0);
}

run();
