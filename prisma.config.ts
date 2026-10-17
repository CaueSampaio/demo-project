import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Two-step load: .env first, then .env.local with override. This matches the
// docker-compose env_file / dotenv "last wins" convention where .env.local is
// the local override layer. Note this differs from nitro's dev loader, which
// is first-wins for .env then .env.local; with the current file contents
// (identical DATABASE_URL in both files) there is no conflict.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
