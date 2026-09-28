import mongoose from "mongoose";

const SerialSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true },
    encryptedCode: { type: String, required: true },
    status: {
      type: String,
      enum: ["AVAILABLE", "ASSIGNED", "ALLOCATED", "VERIFIED", "VOID"],
      default: "AVAILABLE",
    },
    source: {
      type: String,
      enum: ["MANUAL_SINGLE", "MANUAL_BATCH", "CSV_IMPORT", "WEBHOOK"],
      required: true,
    },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" },
    orderId: { type: String },
    orderItemId: { type: String },
    externalOrderId: { type: String },
    assignedToRef: { type: String }, // Legacy
    assignment: {
      channel: { type: String, enum: ["MANUAL", "WHATSAPP", "OFFLINE", "MARKETPLACE", "OTHER"] },
      orderRef: String,
      customerRef: String,
      assignedAt: Date,
      assignedBy: String
    },
    generatedAt: { type: Date, default: Date.now },
    allocatedAt: { type: Date },
    assignedAt: { type: Date }, // Legacy
    verifiedAt: { type: Date },
    voidedAt: { type: Date },
  },
  { timestamps: true }
);

const StoreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mark: { type: String }, // e.g. "SP", "TP"
    logoUrl: { type: String },
    storeUrl: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SocialLinkSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["instagram", "tiktok", "x", "facebook", "pinterest", "threads"],
      required: true,
    },
    url: { type: String, required: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    path: { type: String }, // SVG path backup if needed
  },
  { timestamps: true }
);

const StoreWebhookIntegrationSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    provider: { type: String, required: true },
    name: { type: String, required: true },
    endpointKey: { type: String, required: true, unique: true },
    encryptedSecret: { type: String },
    status: { type: String, enum: ["NOT_CONFIGURED", "CONFIGURED", "ACTIVE", "DEGRADED", "AUTH_ERROR", "DISABLED"], default: "NOT_CONFIGURED" },
    configuration: { type: mongoose.Schema.Types.Mixed },
    lastEventAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastErrorAt: { type: Date },
    lastConnectionTestAt: { type: Date },
    lastConnectionLatencyMs: { type: Number },
    lastConnectionErrorCode: { type: String },
  },
  { timestamps: true }
);

const WebhookEventSchema = new mongoose.Schema(
  {
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreWebhookIntegration", required: true },
    provider: { type: String, required: true },
    externalEventId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    eventType: { type: String },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    status: {
      type: String,
      enum: ["RECEIVED", "QUEUED", "PROCESSING", "WAITING_FOR_PROVIDER", "PROCESSED", "FAILED", "IGNORED"],
      default: "RECEIVED",
    },
    errorCode: { type: String },
    errorMessage: { type: String },
    payloadHash: { type: String },
    safePayloadSnapshot: { type: mongoose.Schema.Types.Mixed },
    
    // Recovery / Retry metadata
    processingStartedAt: { type: Date },
    attemptCount: { type: Number, default: 0 },
    manualRetryCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    nextRetryAt: { type: Date },
    lastError: { type: String },
    workerId: { type: String },
  },
  { timestamps: true }
);
WebhookEventSchema.index({ integrationId: 1, idempotencyKey: 1 }, { unique: true });

const MarketplaceOrderAllocationSchema = new mongoose.Schema(
  {
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreWebhookIntegration", required: true },
    provider: { type: String, required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    externalOrderId: { type: String, required: true },
    externalOrderItemId: { type: String, required: true },
    serialId: { type: mongoose.Schema.Types.ObjectId, ref: "Serial", required: true },
    productId: { type: String },
    sku: { type: String },
    quantity: { type: Number, default: 1 },
    serialsPerUnit: { type: Number, default: 1 },
    allocationSequence: { type: Number, required: true }, // To distinguish multiple serials for the same item
  },
  { timestamps: true }
);
// Business-level idempotency to prevent duplicate serials for the same exact position in the order
MarketplaceOrderAllocationSchema.index({ integrationId: 1, externalOrderId: 1, externalOrderItemId: 1, allocationSequence: 1 }, { unique: true });

const ProductRuleSchema = new mongoose.Schema(
  {
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: "StoreWebhookIntegration", required: true },
    providerProductId: { type: String, required: true },
    sku: { type: String },
    isEligible: { type: Boolean, default: true },
    serialsPerUnit: { type: Number, default: 1 },
  },
  { timestamps: true }
);
ProductRuleSchema.index({ integrationId: 1, providerProductId: 1 }, { unique: true });

const VerificationEventSchema = new mongoose.Schema(
  {
    serialId: { type: mongoose.Schema.Types.ObjectId, ref: "Serial" }, // nullable for invalid attempt
    result: {
      type: String,
      enum: ["VERIFIED", "ALREADY_VERIFIED", "INVALID", "RATE_LIMITED"],
      required: true,
    },
    ipHash: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const AuditLogSchema = new mongoose.Schema(
  {
    adminEmail: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const CertificateSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true },
    serialId: { type: mongoose.Schema.Types.ObjectId, ref: "Serial", required: true, unique: true },
    claimTokenHash: { type: String }, // Hashed token to authorize viewing after initial claim
    status: {
      type: String,
      enum: ["PROCESSING", "READY", "FAILED", "REVOKED"],
      default: "PROCESSING",
    },
    issuedAt: { type: Date, default: Date.now },
    issuedTimezone: { type: String },
    purchaseDate: { type: Date },
    location: {
      country: String,
      countryCode: String,
      region: String,
      regionCode: String,
      displayName: String,
      source: String,
      status: String,
      reason: String,
      databaseType: String,
      databaseBuildEpoch: String,
      resolvedAt: Date,
    },
    pdfObjectKey: { type: String },
    pdfSha256: { type: String },
    fileSize: { type: Number },
    templateVersion: { type: String, default: "v1" },
    generatedAt: { type: Date },
    generationHistory: [
      {
        templateVersion: String,
        pdfObjectKey: String,
        pdfSha256: String,
        fileSize: Number,
        generatedAt: Date,
        generatedBy: String,
        reason: String
      }
    ],
  },
  { timestamps: true }
);

export const Serial = mongoose.models.Serial || mongoose.model("Serial", SerialSchema);
export const Store = mongoose.models.Store || mongoose.model("Store", StoreSchema);
export const SocialLink = mongoose.models.SocialLink || mongoose.model("SocialLink", SocialLinkSchema);
export const StoreWebhookIntegration = mongoose.models.StoreWebhookIntegration || mongoose.model("StoreWebhookIntegration", StoreWebhookIntegrationSchema);
export const WebhookEvent = mongoose.models.WebhookEvent || mongoose.model("WebhookEvent", WebhookEventSchema);
export const ProductRule = mongoose.models.ProductRule || mongoose.model("ProductRule", ProductRuleSchema);
export const VerificationEvent = mongoose.models.VerificationEvent || mongoose.model("VerificationEvent", VerificationEventSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
export const Certificate = mongoose.models.Certificate || mongoose.model("Certificate", CertificateSchema);

const CertificateAccessEventSchema = new mongoose.Schema(
  {
    certificateId: { type: mongoose.Schema.Types.ObjectId, ref: "Certificate", required: true },
    publicId: { type: String, required: true },
    action: { type: String, enum: ["VIEW_REQUESTED", "DOWNLOAD_REQUESTED"], required: true },
    authorizationResult: { type: String, enum: ["GRANTED", "DENIED"], required: true },
    ipHash: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const CertificateAccessEvent = mongoose.models.CertificateAccessEvent || mongoose.model("CertificateAccessEvent", CertificateAccessEventSchema);
export const MarketplaceOrderAllocation = mongoose.models.MarketplaceOrderAllocation || mongoose.model("MarketplaceOrderAllocation", MarketplaceOrderAllocationSchema);

const NonceSchema = new mongoose.Schema({
  nonce: { type: String, required: true, unique: true },
  createdAt: { type: Date, expires: 300, default: Date.now } // 5 minutes TTL
});
export const Nonce = mongoose.models.Nonce || mongoose.model('Nonce', NonceSchema);

