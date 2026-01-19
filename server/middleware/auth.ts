import type { Context, Next } from "hono";
import { auth } from "../auth";
import type { Env } from "../index";

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  } | null;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  } | null;
}

export const authMiddleware = async (
  c: Context<{ Bindings: Env; Variables: AuthContext }>,
  next: Next
) => {
  const authInstance = auth(c.env);

  try {
    const session = await authInstance.api.getSession({
      headers: c.req.raw.headers,
    });

    if (session) {
      c.set("user", session.user);
      c.set("session", session.session);
    } else {
      c.set("user", null);
      c.set("session", null);
    }
  } catch {
    c.set("user", null);
    c.set("session", null);
  }

  await next();
};

export const requireAuth = async (
  c: Context<{ Bindings: Env; Variables: AuthContext }>,
  next: Next
) => {
  await authMiddleware(c, next);

  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
