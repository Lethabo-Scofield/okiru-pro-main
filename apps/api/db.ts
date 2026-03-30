import mongoose from "mongoose";

let mongoConnected = false;

export function isMongoConnected(): boolean {
  return mongoConnected;
}

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[MongoDB] MONGO_URI/MONGODB_URI not set. Running without MongoDB — data-dependent routes will be unavailable.");
    return;
  }

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`[MongoDB] Connecting (attempt ${attempt}/${maxRetries})...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log("[MongoDB] Connected successfully");
      mongoConnected = true;

      mongoose.connection.on("error", (err) => {
        console.error("[MongoDB] Connection error:", err.message);
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("[MongoDB] Disconnected. Mongoose will auto-reconnect.");
      });

      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MongoDB] Connection attempt ${attempt} failed:`, msg);
      if (attempt >= maxRetries) {
        console.warn(`[MongoDB] Failed to connect after ${maxRetries} attempts. Continuing without MongoDB.`);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

export { mongoose };
