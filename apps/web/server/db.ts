import mongoose from "mongoose";

let isConnected = false;

export async function connectDB(): Promise<typeof mongoose> {
  if (isConnected) return mongoose;

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MONGODB_URI must be set in production.");
    }
    console.warn("WARNING: MONGODB_URI is not set. Database features will be unavailable.");
    return mongoose;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("Connected to MongoDB");
    return mongoose;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  console.log("MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

export { mongoose };
