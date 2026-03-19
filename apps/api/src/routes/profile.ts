import { Router, type Request as ExpressRequest, type Response } from 'express';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;
import multer from 'multer';
import { storage } from '../../storage.js';
import { requireAuth } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.patch('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fullName, email } = req.body;
    const updated = await storage.updateUser(req.session.userId!, { fullName, email });
    if (!updated) return res.status(404).json({ message: "User not found" });
    return res.json({ user: { id: updated.id, username: updated.username, fullName: updated.fullName, email: updated.email, role: updated.role, organizationId: updated.organizationId, profilePicture: updated.profilePicture } });
  } catch {
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

router.post('/picture', requireAuth, upload.single('picture'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const updated = await storage.updateUser(req.session.userId!, { profilePicture: base64 });
    if (!updated) return res.status(404).json({ message: "User not found" });
    return res.json({ user: { id: updated.id, username: updated.username, fullName: updated.fullName, email: updated.email, role: updated.role, organizationId: updated.organizationId, profilePicture: updated.profilePicture } });
  } catch {
    return res.status(500).json({ message: "Failed to upload picture" });
  }
});

export default router;

