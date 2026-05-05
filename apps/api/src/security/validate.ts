/**
 * Request body validator using zod.
 *
 * Wraps a zod schema as Express middleware that returns a structured 400
 * with the parsed validation errors on failure, and replaces `req.body`
 * with the parsed (typed, default-applied) value on success.
 */
import type { Request, Response, NextFunction } from "express";
import type { ZodTypeAny } from "zod";

export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema) {
  return function validateBodyMiddleware(req: Request, res: Response, next: NextFunction) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid request body",
        errors: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<TSchema extends ZodTypeAny>(schema: TSchema) {
  return function validateQueryMiddleware(req: Request, res: Response, next: NextFunction) {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        message: "Invalid query parameters",
        errors: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }
    // Avoid reassigning req.query (read-only in Express 5); merge instead.
    Object.assign(req.query as Record<string, unknown>, result.data as Record<string, unknown>);
    next();
  };
}
