import type { Config } from "drizzle-kit";

export default {
  schema: "./server/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
  	accountId: "47c2b4d598af9d423c06fc9f936226d5",
		databaseId: "1158199b-5efd-46dd-97b8-5182ef58e572",
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
} satisfies Config;
