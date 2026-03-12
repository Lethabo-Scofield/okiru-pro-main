export default function handler(_req: any, res: any) {
  res.status(200).json({ 
    status: "ok", 
    time: new Date().toISOString(),
    env: {
      hasMongoDB: !!process.env.MONGODB_URI,
      hasGroq: !!process.env.GROQ_API_KEY,
      hasSession: !!process.env.SESSION_SECRET,
      nodeVersion: process.version,
    }
  });
}
