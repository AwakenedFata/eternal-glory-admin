import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not found in .env");
  process.exit(1);
}

const StoreSchema = new mongoose.Schema({
  name: String,
  mark: String,
  logoUrl: String,
  storeUrl: String,
  sortOrder: Number,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const SocialLinkSchema = new mongoose.Schema({
  platform: String,
  url: String,
  sortOrder: Number,
  isActive: { type: Boolean, default: true },
  path: String,
}, { timestamps: true });

const Store = mongoose.models.Store || mongoose.model("Store", StoreSchema);
const SocialLink = mongoose.models.SocialLink || mongoose.model("SocialLink", SocialLinkSchema);

const INITIAL_STORES = [
  { name: "Shopee", mark: "SP", storeUrl: "#", sortOrder: 0 },
  { name: "Tokopedia", mark: "TP", storeUrl: "#", sortOrder: 1 },
  { name: "TikTok Shop", mark: "TT", storeUrl: "#", sortOrder: 2 },
  { name: "Blibli", mark: "BL", storeUrl: "#", sortOrder: 3 },
  { name: "Toco.id", mark: "TC", storeUrl: "#", sortOrder: 4 },
  { name: "Lazada", mark: "LZ", storeUrl: "#", sortOrder: 5 },
];

const INITIAL_SOCIALS = [
  { platform: "instagram", url: "https://instagram.com/", sortOrder: 0 },
  { platform: "tiktok", url: "https://tiktok.com/", sortOrder: 1 },
  { platform: "threads", url: "https://threads.net/", sortOrder: 2 },
  { platform: "x", url: "https://x.com/", sortOrder: 3 },
  { platform: "facebook", url: "https://facebook.com/", sortOrder: 4 },
  { platform: "pinterest", url: "https://pinterest.com/", sortOrder: 5 },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  for (const store of INITIAL_STORES) {
    const existing = await Store.findOne({ name: store.name });
    if (existing) {
      console.log(`Store "${store.name}" already exists, skipping.`);
    } else {
      await Store.create(store);
      console.log(`Created store: ${store.name}`);
    }
  }

  for (const social of INITIAL_SOCIALS) {
    const existing = await SocialLink.findOne({ platform: social.platform });
    if (existing) {
      console.log(`Social "${social.platform}" already exists, skipping.`);
    } else {
      await SocialLink.create(social);
      console.log(`Created social: ${social.platform}`);
    }
  }

  console.log("Seed complete.");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
