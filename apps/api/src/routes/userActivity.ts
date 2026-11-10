import { Router, type Request as ExpressRequest, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { storage } from "../../storage.js";
import { ClientModel, UserActivityEventModel, UserModel, UserProductInterestModel } from "../../models.js";
import { isProductCode, PRODUCT_CODES, recordUserActivity, saveInitialProductInterest, type ActivityEventType } from "../services/userActivity.js";

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;

const router = Router();

function hasSuperAdmin(user: any): boolean {
  return user?.role === "super_admin" || user?.secondaryRoles?.includes("super_admin");
}

async function requireSuperAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.session.userId) {
    res.status(401).json({ message: "Not authenticated" });
    return false;
  }
  if (process.env.NODE_ENV !== "production" && req.session.userId === "demo-offline-user") {
    return true;
  }
  const user = await storage.getUser(req.session.userId);
  if (!hasSuperAdmin(user)) {
    res.status(403).json({ message: "Super-admin access required" });
    return false;
  }
  return true;
}

function pageParams(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

router.post("/activity/product", requireAuth, async (req: Request, res: Response) => {
  const productCode = req.body?.productCode;
  const eventType = req.body?.eventType || "product_opened";
  if (!isProductCode(productCode)) return res.status(400).json({ message: "Valid productCode is required" });
  if (eventType !== "product_opened" && eventType !== "product_switched") {
    return res.status(400).json({ message: "Invalid activity event" });
  }

  const companyId = typeof req.body?.companyId === "string" ? req.body.companyId.trim() : null;
  if (companyId) {
    const accessRules: Record<string, string>[] = [{ createdByUserId: req.session.userId! }];
    if (req.session.organizationId) accessRules.push({ organizationId: req.session.organizationId });
    const client = await ClientModel.findOne({
      $and: [
        { $or: [{ id: companyId }, { clientId: companyId }] },
        { $or: accessRules },
      ],
    }).lean();
    if (!client) return res.status(403).json({ message: "Company access denied" });
  }

  const dedupeKey = `${eventType}:${req.session.userId}:${productCode}:${req.sessionID}`;
  await recordUserActivity(req, {
    eventType: eventType as ActivityEventType,
    productCode,
    companyId,
    dedupeKey,
    metadata: { source: "product_workspace" },
  });
  return res.json({ recorded: true });
});

router.get("/me/products", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const [interests, used] = await Promise.all([
    UserProductInterestModel.find({ userId }).sort({ isInitialSelection: -1, selectedAt: 1 }).lean(),
    UserActivityEventModel.find({ userId, eventType: { $in: ["product_opened", "product_switched"] } })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const initial = interests.find((i) => i.isInitialSelection)?.productCode ?? null;
  const usedCodes = [...new Set(used.map((e) => e.productCode).filter(Boolean))];
  return res.json({
    availableProducts: PRODUCT_CODES.map((code) => ({ code, access: true })),
    initialProductInterest: initial,
    productInterests: interests.map((i) => ({ productCode: i.productCode, isInitialSelection: i.isInitialSelection, selectedAt: i.selectedAt })),
    usedProducts: usedCodes,
  });
});

router.get("/admin/login-events", requireAuth, async (req: Request, res: Response) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const { page, limit, skip } = pageParams(req);
  const filter: Record<string, unknown> = { eventType: { $in: ["login_success", "login_failed"] } };
  if (typeof req.query.userId === "string" && req.query.userId) filter.userId = req.query.userId;
  if (typeof req.query.productCode === "string" && isProductCode(req.query.productCode)) filter.productCode = req.query.productCode;
  const [events, total] = await Promise.all([
    UserActivityEventModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    UserActivityEventModel.countDocuments(filter),
  ]);
  const userIds = [...new Set(events.map((e) => e.userId))];
  const users = await UserModel.find({ id: { $in: userIds } }, { id: 1, email: 1, fullName: 1, username: 1, _id: 0 }).lean();
  const userMap = new Map(users.map((u) => [u.id, u]));
  return res.json({
    events: events.map((e) => ({ ...e, user: userMap.get(e.userId) ?? null })),
    total,
    page,
    limit,
  });
});

router.get("/admin/product-usage", requireAuth, async (req: Request, res: Response) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  const match: Record<string, unknown> = { eventType: { $in: ["product_opened", "product_switched"] } };
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    const range: Record<string, Date> = {};
    if (from && !Number.isNaN(from.getTime())) range.$gte = from;
    if (to && !Number.isNaN(to.getTime())) range.$lte = to;
    match.createdAt = range;
  }
  const rows = await UserActivityEventModel.aggregate([
    { $match: match },
    { $group: {
      _id: "$productCode",
      uniqueUsers: { $addToSet: "$userId" },
      accessCount: { $sum: 1 },
      firstAccess: { $min: "$createdAt" },
      mostRecentAccess: { $max: "$createdAt" },
      switches: { $sum: { $cond: [{ $eq: ["$eventType", "product_switched"] }, 1, 0] } },
    } },
    { $project: {
      _id: 0,
      productCode: "$_id",
      uniqueUsers: { $size: "$uniqueUsers" },
      accessCount: 1,
      firstAccess: 1,
      mostRecentAccess: 1,
      switches: 1,
    } },
    { $sort: { productCode: 1 } },
  ]);
  return res.json({ products: rows });
});

router.get("/admin/analytics", requireAuth, async (req: Request, res: Response) => {
  if (!(await requireSuperAdmin(req, res))) return;
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [totalUsers, newRegistrations, activeDaily, activeMonthly, successfulLogins, initialProducts, inactiveUsers] = await Promise.all([
    UserModel.countDocuments({}),
    UserActivityEventModel.countDocuments({ eventType: "user_registered", createdAt: { $gte: monthAgo } }),
    UserActivityEventModel.distinct("userId", { createdAt: { $gte: dayAgo }, eventType: { $in: ["login_success", "product_opened", "product_switched"] } }).then((ids) => ids.length),
    UserActivityEventModel.distinct("userId", { createdAt: { $gte: monthAgo }, eventType: { $in: ["login_success", "product_opened", "product_switched"] } }).then((ids) => ids.length),
    UserActivityEventModel.countDocuments({ eventType: "login_success", createdAt: { $gte: monthAgo } }),
    UserProductInterestModel.aggregate([{ $match: { isInitialSelection: true } }, { $group: { _id: "$productCode", count: { $sum: 1 } } }]),
    UserModel.countDocuments({ $or: [{ lastLoginAt: null }, { lastLoginAt: { $lt: monthAgo } }] }),
  ]);
  return res.json({
    totalUsers,
    newRegistrations,
    dailyActiveUsers: activeDaily,
    monthlyActiveUsers: activeMonthly,
    successfulLogins,
    inactiveUsers,
    registrationsByInitialProduct: initialProducts.map((r) => ({ productCode: r._id, count: r.count })),
  });
});

export default router;
