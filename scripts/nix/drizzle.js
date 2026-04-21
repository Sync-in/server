import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./release/sync-in-server/server/infrastructure/database/schema.js",
  out: "./backend-migrations",
  url: "mysql://__USER__:__PASSWORD__@__HOST__:__PORT__/__NAME__",
  tablesFilter: [
    'files_content_*'
  ]
});