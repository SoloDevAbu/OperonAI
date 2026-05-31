import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { Logger } from "@operonai/lib";
import { sign } from "hono/jwt";
import { db } from "../lib/db";
import {
  findOrganizationBySlug,
  createOrganization,
  updateOrganization,
} from "@operonai/db";
import { JWT_SECRET, authMiddleware } from "../middleware/auth";

export const organizationsRouter = new Hono<{
  Variables: { orgId?: string; isInternal?: boolean; logger: Logger };
}>();

const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  password: z.string().min(6).max(255),
});

const loginOrgSchema = z.object({
  slug: z.string().min(1),
  password: z.string().min(1),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  password: z.string().min(6).max(255).optional(),
});

organizationsRouter.post(
  "/",
  zValidator("json", createOrgSchema),
  async (c) => {
    const logger = c.get("logger") as Logger | undefined;
    const { name, slug, password } = c.req.valid("json");

    const existing = await findOrganizationBySlug(db, slug);
    if (existing) {
      logger?.warn({ slug }, "signup failed: slug already taken");
      return c.json({ error: "Slug is already taken" }, 409);
    }

    const apiKey = "op_" + randomBytes(24).toString("hex");
    const apiKeyPrefix = apiKey.substring(0, 8);

    const passwordHash = await bcrypt.hash(password, 10);
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const org = await createOrganization(db, {
      name,
      slug,
      password: passwordHash,
      apiKeyHash,
      apiKeyPrefix,
    });

    const token = await sign({ orgId: org.id, slug: org.slug }, JWT_SECRET);

    logger?.info(
      { orgId: org.id, slug: org.slug },
      "organization created successfully"
    );

    return c.json(
      {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
        },
        token,
        apiKey,
      },
      201
    );
  }
);

organizationsRouter.post(
  "/login",
  zValidator("json", loginOrgSchema),
  async (c) => {
    const logger = c.get("logger") as Logger | undefined;
    const { slug, password } = c.req.valid("json");

    const org = await findOrganizationBySlug(db, slug);
    if (!org) {
      logger?.warn({ slug }, "login failed: invalid slug");
      return c.json({ error: "Invalid slug or password" }, 401);
    }

    const isPasswordValid = await bcrypt.compare(password, org.password);
    if (!isPasswordValid) {
      logger?.warn({ slug }, "login failed: invalid password");
      return c.json({ error: "Invalid slug or password" }, 401);
    }

    const token = await sign({ orgId: org.id, slug: org.slug }, JWT_SECRET);
    logger?.info({ orgId: org.id, slug: org.slug }, "organization logged in");

    return c.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
      token,
    });
  }
);

organizationsRouter.patch(
  "/:id",
  authMiddleware,
  zValidator("json", updateOrgSchema),
  async (c) => {
    const logger = c.get("logger") as Logger | undefined;
    const id = c.req.param("id");
    const authenticatedOrgId = c.get("orgId");
    const isInternal = c.get("isInternal");

    if (!isInternal && authenticatedOrgId !== id) {
      logger?.warn(
        { targetId: id, authenticatedOrgId },
        "forbidden: attempt to update other org"
      );
      return c.json(
        { error: "Forbidden: You can only update your own organization" },
        403
      );
    }

    const body = c.req.valid("json");
    const updateData: { name?: string; slug?: string; password?: string } = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.slug !== undefined) {
      // Check if slug is taken
      const existing = await findOrganizationBySlug(db, body.slug);
      if (existing && existing.id !== id) {
        return c.json({ error: "Slug is already taken" }, 409);
      }
      updateData.slug = body.slug;
    }
    if (body.password !== undefined) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }

    const org = await updateOrganization(db, id, updateData);
    if (!org) {
      return c.json({ error: "Organization not found" }, 404);
    }

    return c.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
    });
  }
);

// POST /organizations/:id/rotate-api-key (Protected key rotation)
organizationsRouter.post("/:id/rotate-api-key", authMiddleware, async (c) => {
  const logger = c.get("logger") as Logger | undefined;
  const id = c.req.param("id") as string;
  const authenticatedOrgId = c.get("orgId");
  const isInternal = c.get("isInternal");

  if (!isInternal && authenticatedOrgId !== id) {
    logger?.warn(
      { targetId: id, authenticatedOrgId },
      "forbidden: attempt to rotate api key of other org"
    );
    return c.json(
      {
        error:
          "Forbidden: You can only rotate the API key for your own organization",
      },
      403
    );
  }

  const apiKey = "op_" + randomBytes(24).toString("hex");
  const apiKeyPrefix = apiKey.substring(0, 8);
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const org = await updateOrganization(db, id, {
    apiKeyHash,
    apiKeyPrefix,
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  return c.json({
    apiKey,
  });
});
