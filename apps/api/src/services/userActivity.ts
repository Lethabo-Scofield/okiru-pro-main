import type { Request } from "express";
import { UserActivityEventModel, UserProductInterestModel } from "../../models.js";

export const PRODUCT_CODES = ["esg", "bbbee", "certificates"] as const;
export type ProductCode = (typeof PRODUCT_CODES)[number];
export type ActivityEventType =
  | "user_registered"
  | "product_selected"
  | "login_success"
  | "login_failed"
  | "logout"
  | "product_opened"
  | "product_switched";

const SENSITIVE_KEYS = /password|token|secret|authorization|cookie|credential|body/i;

function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, 300);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
  }
  return out;
}

export function isProductCode(value: unknown): value is ProductCode {
  return typeof value === "string" && (PRODUCT_CODES as readonly string[]).includes(value);
}

export async function recordUserActivity(
  req: Request,
  input: {
    eventType: ActivityEventType;
    userId?: string | null;
    organizationId?: string | null;
    companyId?: string | null;
    productCode?: ProductCode | null;
    metadata?: Record<string, unknown>;
    dedupeKey?: string | null;
  },
): Promise<void> {
  const userId = input.userId ?? req.session.userId ?? null;
  if (!userId) return;

  try {
    await UserActivityEventModel.create({
      userId,
      organizationId: input.organizationId ?? req.session.organizationId ?? null,
      companyId: input.companyId ?? null,
      eventType: input.eventType,
      productCode: input.productCode ?? null,
      sessionId: req.sessionID || null,
      dedupeKey: input.dedupeKey ?? null,
      metadata: sanitizeMetadata(input.metadata),
    });
  } catch (error: any) {
    // Activity must never block authentication or product access. Duplicate
    // dedupe keys are expected when React retries a request.
    if (error?.code !== 11000) {
      console.warn("[UserActivity] failed to persist event", error?.message || error);
    }
  }
}

export async function saveInitialProductInterest(userId: string, productCode: ProductCode): Promise<void> {
  await UserProductInterestModel.updateOne(
    { userId, isInitialSelection: true },
    {
      $setOnInsert: {
        id: `${userId}:${productCode}`,
        userId,
        productCode,
        isInitialSelection: true,
        selectedAt: new Date(),
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}
