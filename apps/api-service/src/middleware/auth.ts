import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { db } from "../lib/db";
import { findOrganizationById } from "@operonai/db";
import {
  HEADER_INTERNAL_SECRET,
  HEADER_ORG_ID,
  HEADER_AUTHORIZATION,
  JWT_COOKIE_NAME,
} from "@operonai/lib";
import type { Logger } from "@operonai/lib";

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "internal-secret";
export const JWT_SECRET =
  process.env.JWT_SECRET ?? "default-jwt-secret-key-change-me";

export const authMiddleware = async (
  c: Context,
  next: Next
): Promise<void | Response> => {
  const logger = c.get("logger") as Logger | undefined;
  const internalSecret = c.req.header(HEADER_INTERNAL_SECRET);

  if (internalSecret) {
    if (internalSecret !== INTERNAL_SECRET) {
      logger?.warn({ path: c.req.path }, "invalid internal secret attempted");
      return c.json({ error: "Invalid internal secret" }, 401);
    }

    const internalOrgId = c.req.header(HEADER_ORG_ID);
    if (!internalOrgId) {
      logger?.warn({ path: c.req.path }, "internal request missing orgId");
      return c.json(
        { error: "Internal request must provide organization ID" },
        400
      );
    }

    const organization = await findOrganizationById(db, internalOrgId);
    if (!organization) {
      logger?.warn(
        { path: c.req.path, orgId: internalOrgId },
        "organization not found for internal request"
      );
      return c.json({ error: "Organization not found" }, 404);
    }

    c.set("isInternal", true);
    c.set("orgId", internalOrgId);
    c.set("organization", organization);
    await next();
    return;
  }

  let token = getCookie(c, JWT_COOKIE_NAME);
  if (!token) {
    const authHeader = c.req.header(HEADER_AUTHORIZATION);
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    logger?.warn({ path: c.req.path }, "missing authentication token");
    return c.json({ error: "Authentication required" }, 401);
  }

  let jwtPayload: { orgId: string; slug: string } | null = null;
  try {
    jwtPayload = (await verify(token, JWT_SECRET, "HS256")) as {
      orgId: string;
      slug: string;
    };
  } catch (err) {
    logger?.warn({ path: c.req.path }, "invalid authentication token");
    return c.json({ error: "Invalid token" }, 401);
  }

  const orgId = jwtPayload.orgId;
  const organization = await findOrganizationById(db, orgId);

  if (!organization) {
    logger?.warn(
      { path: c.req.path, orgId },
      "organization not found for valid token"
    );
    return c.json({ error: "Organization not found" }, 404);
  }

  c.set("orgId", orgId);
  c.set("organization", organization);
  await next();
};
