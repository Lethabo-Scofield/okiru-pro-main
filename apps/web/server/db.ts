import mongoose from "mongoose";
import { createLogger } from "./logger";

const logger = createLogger("WebDB");

let isConnected = false;

export async function connectDB(): Promise<typeof mongoose> {
  if (isConnected) return mongoose;

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGODB_URI) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MONGODB_URI must be set in production.");
    }
    logger.warn("MONGODB_URI is not set - database features will be unavailable");
    return mongoose;
  }

  try {
    logger.debug("Connecting to MongoDB...", { uri: MONGODB_URI.replace(/\/\/.*@/, "//***@") });
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: process.env.NODE_ENV === "production" ? 30000 : 3000,
    });
    isConnected = true;
    logger.info("Connected to MongoDB successfully");

    try {
      const db = mongoose.connection.db;
      if (db) {
        const usersCollection = db.collection("users");
        const indexes = await usersCollection.indexes();
        const staleIndex = indexes.find((idx: any) => idx.name === "id_1");
        if (staleIndex) {
          await usersCollection.dropIndex("id_1");
          logger.info("Dropped stale 'id_1' index from users collection");
        }
      }
    } catch (indexErr) {
      logger.warn("Index cleanup skipped", { reason: (indexErr as Error).message });
    }

    return mongoose;
  } catch (error) {
    logger.error("MongoDB connection failed", error);
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
    mongoose.set("bufferCommands", false);
    logger.warn("Continuing without MongoDB in development - database features will be unavailable");
    return mongoose;
  }
}

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  logger.warn("MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  logger.error("MongoDB connection error", err);
});

export { mongoose };
