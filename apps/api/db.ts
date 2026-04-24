import mongoose from "mongoose";
import { createLogger } from "./src/logger.js";

const logger = createLogger("ApiDB");

let mongoConnected = false;

export function isMongoConnected(): boolean {
  return mongoConnected;
}

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    logger.warn("MONGO_URI/MONGODB_URI not set — running without MongoDB, data-dependent routes will be unavailable");
    return;
  }

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      logger.info("Connecting to MongoDB", { attempt, maxRetries });
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      logger.info("MongoDB connected successfully");
      mongoConnected = true;

      mongoose.connection.on("error", (err) => {
        logger.error("MongoDB connection error", err);
      });

      mongoose.connection.on("disconnected", () => {
        logger.warn("MongoDB disconnected — Mongoose will auto-reconnect");
      });

      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`MongoDB connection attempt ${attempt} failed`, err as Error);
      if (attempt >= maxRetries) {
        logger.warn(`Failed to connect to MongoDB after ${maxRetries} attempts — continuing without MongoDB`);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

export { mongoose };
