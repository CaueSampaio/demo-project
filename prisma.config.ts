import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Two-step load: .env first, then .env.local with override. This matches the
// docker-compose env_file / dotenv "last wins" convention where .env.local is
// the local override layer. dotenv applies the second load last-wins on
// individual keys (c12/nitro merges later-wins too), so with the current file
// contents (identical DATABASE_URL in both files) there is no conflict.
// Paths are resolved against this module's own directory (the repo root) so
// the CLI behaves the same regardless of cwd or restarts.
const repo = import.meta.dirname;
dotenv.config({ path: path.join(repo, ".env") });
dotenv.config({ path: path.join(repo, ".env.local"), override: true });

export default defineConfig({
  schema: path.join(repo, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
