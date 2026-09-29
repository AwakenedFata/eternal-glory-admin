const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

// Mock the Shopee Order Service for this E2E test to avoid needing real credentials right now
const shopeeServicePath = require.resolve('../lib/webhooks/shopee/order-service');
require.cache[shopeeServicePath] = {
  id: shopeeServicePath,
  filename: shopeeServicePath,
  loaded: true,
  exports: {
    fetchShopeeOrderDetails: async (integration, ordersn) => {
      console.log(`[MOCK] Fetching Shopee Order Details for ${ordersn}`);
      return {
        order_sn: ordersn,
        order_status: "READY_TO_SHIP",
        item_list: [
          {
            item_id: 1111,
            item_name: "Mock Product",
            item_sku: "SKU-MOCK",
            model_id: 2222,
            model_sku: "SKU-MOCK-VAR",
            model_quantity_purchased: ordersn.includes("QTY3") ? 3 : 1
          }
        ]
      };
    }
  }
};

async function runE2E() {
  console.log("==================================================");
  console.log("PHASE 2C — MOCKED VERTICAL SLICE EVIDENCE");
  console.log("==================================================");

  await mongoose.connect(process.env.MONGODB_URI);
  const { Store, StoreWebhookIntegration, WebhookEvent, ProductRule, MarketplaceOrderAllocation, Serial } = require('../lib/db/models');
  const { processWebhookQueue } = require('../lib/webhooks/worker');
  const crypto = require('crypto');

  // Setup Test Integration
  const testStore = await Store.findOneAndUpdate({ name: "E2E Test Store" }, { name: "E2E Test Store", storeUrl: "https://test.com" }, { upsert: true, returnDocument: 'after' });
  
  const endpointKey = "e2e-mock-key-" + Date.now();
  const integration = await StoreWebhookIntegration.create({
    storeId: testStore._id,
    provider: "SHOPEE",
    name: "E2E Integration",
    endpointKey,
    status: "ACTIVE",
    configuration: { partnerId: "123", shopId: "456" }
  });

  // Setup Product Rules
  await ProductRule.create([
    { integrationId: integration._id, providerProductId: "2222", sku: "SKU-MOCK-VAR", serialsPerUnit: 1 },
    { integrationId: integration._id, providerProductId: "3333", sku: "SKU-MOCK-VAR-BUNDLE", serialsPerUnit: 2 }
  ]);

  console.log("1. TEST ORDER #1 (QTY=1, SerialsPerUnit=1)");
  let orderSn1 = "MOCK-ORD-QTY1-" + Date.now();
  
  // Simulate Webhook Receiver
  const payload1 = {
    shop_id: 456,
    code: 3, // PAID
    timestamp: Date.now(),
    data: { ordersn: orderSn1, status: "READY_TO_SHIP" }
  };
  
  let event1 = await WebhookEvent.create({
    integrationId: integration._id,
    provider: "SHOPEE",
    externalEventId: "EVT-" + Date.now(),
    idempotencyKey: "IDEM-" + orderSn1,
    eventType: "ORDER_STATUS",
    status: "QUEUED",
    safePayloadSnapshot: payload1
  });
  console.log(`[Webhook] Event created and QUEUED: ${event1._id}`);

  // Run Worker
  let workerResult = await processWebhookQueue();
  console.log(`[Worker] Processed event:`, workerResult);

  // Assertions
  let allocCount = await MarketplaceOrderAllocation.countDocuments({ externalOrderId: orderSn1 });
  let serialCount = await Serial.countDocuments({ externalOrderId: orderSn1 });
  console.log(`[DB] Allocations: ${allocCount} (Expected: 1), Serials: ${serialCount} (Expected: 1)`);
  if (allocCount === 1 && serialCount === 1) console.log("-> PASS: QTY=1 generated exactly 1 serial.");
  else console.log("-> FAIL");

  console.log("\n2. IDEMPOTENCY TEST (Re-processing same Webhook)");
  // Reset event to QUEUED to simulate worker picking up a duplicate retry
  event1.status = "QUEUED";
  event1.attemptCount = 0;
  await event1.save();
  
  workerResult = await processWebhookQueue();
  console.log(`[Worker] Re-processed duplicate event:`, workerResult);
  allocCount = await MarketplaceOrderAllocation.countDocuments({ externalOrderId: orderSn1 });
  serialCount = await Serial.countDocuments({ externalOrderId: orderSn1 });
  console.log(`[DB] Allocations: ${allocCount} (Expected: 1), Serials: ${serialCount} (Expected: 1)`);
  if (allocCount === 1 && serialCount === 1) console.log("-> PASS: Re-processing is idempotent. No duplicate serials created.");
  else console.log("-> FAIL");

  console.log("\n3. TEST ORDER #2 (QTY=3, SerialsPerUnit=1)");
  let orderSn2 = "MOCK-ORD-QTY3-" + Date.now();
  
  await WebhookEvent.create({
    integrationId: integration._id,
    provider: "SHOPEE",
    externalEventId: "EVT-2-" + Date.now(),
    idempotencyKey: "IDEM-" + orderSn2,
    eventType: "ORDER_STATUS",
    status: "QUEUED",
    safePayloadSnapshot: { data: { ordersn: orderSn2 } }
  });
  
  workerResult = await processWebhookQueue();
  allocCount = await MarketplaceOrderAllocation.countDocuments({ externalOrderId: orderSn2 });
  serialCount = await Serial.countDocuments({ externalOrderId: orderSn2 });
  console.log(`[DB] Allocations: ${allocCount} (Expected: 3), Serials: ${serialCount} (Expected: 3)`);
  if (allocCount === 3 && serialCount === 3) console.log("-> PASS: QTY=3 generated exactly 3 serials.");
  else console.log("-> FAIL");

  console.log("\n4. TEST ORDER #3 (QTY=3, SerialsPerUnit=2)");
  let orderSn3 = "MOCK-ORD-QTY3-BUNDLE-" + Date.now();
  
  // Modify mock to return the bundle model ID
  require.cache[shopeeServicePath].exports.fetchShopeeOrderDetails = async () => ({
    order_sn: orderSn3,
    item_list: [{ item_id: 1111, model_id: 3333, model_sku: "SKU-MOCK-VAR-BUNDLE", model_quantity_purchased: 3 }]
  });

  await WebhookEvent.create({
    integrationId: integration._id,
    provider: "SHOPEE",
    externalEventId: "EVT-3-" + Date.now(),
    idempotencyKey: "IDEM-" + orderSn3,
    eventType: "ORDER_STATUS",
    status: "QUEUED",
    safePayloadSnapshot: { data: { ordersn: orderSn3 } }
  });
  
  workerResult = await processWebhookQueue();
  allocCount = await MarketplaceOrderAllocation.countDocuments({ externalOrderId: orderSn3 });
  serialCount = await Serial.countDocuments({ externalOrderId: orderSn3 });
  console.log(`[DB] Allocations: ${allocCount} (Expected: 6), Serials: ${serialCount} (Expected: 6)`);
  if (allocCount === 6 && serialCount === 6) console.log("-> PASS: Bundle logic (QTY 3 x 2 Serials/Unit) generated exactly 6 serials.");
  else console.log("-> FAIL");

  console.log("\n5. FAILURE TEST (Worker Retry logic)");
  let orderSnFail = "MOCK-ORD-FAIL";
  require.cache[shopeeServicePath].exports.fetchShopeeOrderDetails = async () => {
    throw new Error("Simulated Provider Network Error");
  };

  let failEvent = await WebhookEvent.create({
    integrationId: integration._id,
    provider: "SHOPEE",
    externalEventId: "EVT-FAIL",
    idempotencyKey: "IDEM-" + orderSnFail,
    status: "QUEUED",
    safePayloadSnapshot: { data: { ordersn: orderSnFail } }
  });

  workerResult = await processWebhookQueue();
  failEvent = await WebhookEvent.findById(failEvent._id);
  console.log(`[Worker Result] success: ${workerResult.success}, error: ${workerResult.error}`);
  console.log(`[DB] Event Status: ${failEvent.status} (Expected: QUEUED), attemptCount: ${failEvent.attemptCount} (Expected: 1)`);
  if (!workerResult.success && failEvent.status === "QUEUED" && failEvent.attemptCount === 1) {
    console.log("-> PASS: Network failure cleanly aborts processing, preserves event for retry.");
  } else {
    console.log("-> FAIL");
  }

  // Cleanup
  await StoreWebhookIntegration.deleteOne({ _id: integration._id });
  mongoose.disconnect();
  console.log("\nEnd of E2E Mock Validation.");
}

runE2E();
