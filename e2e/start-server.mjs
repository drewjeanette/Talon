// Starts an isolated Talon server for Playwright on :8788.
//
// Every run gets a fresh local D1 in e2e/.state (migrated + seeded), so tests
// can change passwords and settings without touching your dev database or the
// remote one. Server output is also written to e2e/.server.log so tests can
// read the emails printed by EMAIL_DEV_LOG (e.g. password reset links).

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(root, "server");
const state = join(root, "e2e", ".state");
const log = join(root, "e2e", ".server.log");
const PORT = 8788;

const wrangler = (args, opts = {}) =>
  spawnSync("npx", ["wrangler", ...args], { cwd: server, stdio: "inherit", shell: true, ...opts });

rmSync(state, { recursive: true, force: true });
if (!existsSync(join(server, "seed", "seed.sql"))) {
  spawnSync("node", ["seed/generate-seed.mjs"], { cwd: server, stdio: "inherit" });
}
// Throwaway accounts for tests that change a password, one per Playwright
// project, so the shared demo logins keep working. Same password as the seed.
const resetUsers = ["e2e.reset.desktop@tntech.edu", "e2e.reset.mobile@tntech.edu"]
  .map((email) => `INSERT INTO users (email, password_hash, first_name, last_name)
    SELECT '${email}', password_hash, 'Reset', 'Tester' FROM users WHERE email = 'student@tntech.edu';`)
  .join(" ");

for (const args of [
  ["d1", "migrations", "apply", "talon-db", "--local", "--persist-to", state],
  ["d1", "execute", "talon-db", "--local", "--persist-to", state, "--file=./seed/seed.sql"],
  ["d1", "execute", "talon-db", "--local", "--persist-to", state, `--command="${resetUsers.replace(/\s+/g, " ")}"`],
]) {
  const result = wrangler(args, { env: { ...process.env, CI: "1" } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Test-only values. Real secrets never belong here.
const vars = {
  APP_URL: `http://localhost:${PORT}`,
  EMAIL_DEV_LOG: "true",
  JWT_ACCESS_SECRET: "e2e-access-secret-not-for-production-use-0123456789",
  JWT_REFRESH_SECRET: "e2e-refresh-secret-not-for-production-use-9876543210",
};

const out = createWriteStream(log);
const child = spawn(
  "npx",
  ["wrangler", "dev", "--port", String(PORT), "--persist-to", state,
    ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`])],
  { cwd: server, shell: true }
);
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => { out.write(chunk); process.stdout.write(chunk); });
}
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
