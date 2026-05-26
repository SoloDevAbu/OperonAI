import type { Context, Next } from "hono";
import { db } from "../lib/db";
import { organizations, findOrganizationById } from "@operonai/db";

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "internal-secret";

export const authMiddleware = async (
  c: Context,
  next: Next
): Promise<void | Response> => {
  const internalSecret = c.req.header("x-internal-secret");

  if (internalSecret) {
    if (internalSecret !== INTERNAL_SECRET) {
      return c.json({ error: "Invalid internal secret" }, 401);
    }
    // Set a sentinel so route handlers know this is an internal call
    c.set("isInternal", true);
    await next();
    return;
  }

  const orgId = c.req.header("x-org-id");

  if (!orgId) {
    return c.json({ error: "Organization ID is required" }, 400);
  }

  const organization = await findOrganizationById(db, orgId);

  if (!organization) {
    return c.json({ error: "Organization not found" }, 404);
  }

  c.set("orgId", orgId);
  c.set("organization", organization);
  await next();
};
