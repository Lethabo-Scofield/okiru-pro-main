import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI environment variable is not set. Please provide your MongoDB Atlas connection string.");
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

      mongoose.connection.on("error", (err) => {
        console.error("[MongoDB] Connection error:", err.message);
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("[MongoDB] Disconnected. Mongoose will auto-reconnect.");
      });

      return;
    } catch (err: any) {
      console.error(`[MongoDB] Connection attempt ${attempt} failed:`, err.message);
      if (attempt >= maxRetries) {
        throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

export { mongoose };
