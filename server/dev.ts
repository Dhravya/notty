import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

// Mock environment for local development
const mockEnv = {
  NOTTY_KV: {
    get: async (key: string) => {
      const fs = await import("fs");
      const path = await import("path");
      const dataDir = path.join(process.cwd(), ".data");
      try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const filePath = path.join(dataDir, `${key.replace(/[^a-z0-9]/gi, "_")}.json`);
        if (fs.existsSync(filePath)) {
          return fs.readFileSync(filePath, "utf-8");
        }
      } catch {}
      return null;
    },
    put: async (key: string, value: string) => {
      const fs = await import("fs");
      const path = await import("path");
      const dataDir = path.join(process.cwd(), ".data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const filePath = path.join(dataDir, `${key.replace(/[^a-z0-9]/gi, "_")}.json`);
      fs.writeFileSync(filePath, value);
    },
    delete: async (key: string) => {
      const fs = await import("fs");
      const path = await import("path");
      const dataDir = path.join(process.cwd(), ".data");
      const filePath = path.join(dataDir, `${key.replace(/[^a-z0-9]/gi, "_")}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },
    list: async (options: { prefix: string }) => {
      const fs = await import("fs");
      const path = await import("path");
      const dataDir = path.join(process.cwd(), ".data");
      if (!fs.existsSync(dataDir)) return { keys: [] };
      const files = fs.readdirSync(dataDir);
      const prefix = options.prefix.replace(/[^a-z0-9]/gi, "_");
      return {
        keys: files
          .filter((f) => f.startsWith(prefix))
          .map((f) => ({ name: f.replace(".json", "").replace(/_/g, "-") })),
      };
    },
  },
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "dev-secret-at-least-32-characters!!",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:5173",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  SUPERMEMORY_API_KEY: process.env.SUPERMEMORY_API_KEY || "",
};

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  })
);

// Import and mount API routes
import { noteRoutes } from "./routes/notes";
import { searchRoutes } from "./routes/search";
import { generateRoutes } from "./routes/generate";

// Bind mock environment
app.use("*", async (c, next) => {
  c.env = mockEnv as unknown as typeof c.env;
  await next();
});

app.route("/api/notes", noteRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/generate", generateRoutes);

app.get("/api/health", (c) => c.json({ status: "ok" }));

const port = 3001;
console.log(`API Server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
