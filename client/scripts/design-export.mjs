#!/usr/bin/env node
// Builds the Talon frontend in design mode and writes one self-contained HTML
// file per design view into design/outbox/, ready to give to a teammate.
//
//   npm run design:export
//
// Each file is the real app running on the mock backend. Dashboard files are
// signed in as their role; the Login file stays signed out.

import fs from "node:fs";
import path from "node:path";
import { build } from "vite";
import { buildDesignFile, ROLES, ROLE_LABELS } from "../src/design/designFile.js";
import {
  CLIENT_DIR,
  INBOX_DIR,
  OUTBOX_DIR,
  REPO_DIR,
  designFileName,
  hashCss,
  readRoleCss,
  sourceFingerprint,
} from "./design-lib.mjs";

async function buildDesignApp() {
  // VITE_* variables already in process.env take priority over .env files, so a
  // local .env pointing at a real API cannot leak into a shared design file.
  process.env.VITE_DESIGN_MODE = "true";
  process.env.VITE_MOCK_MODE = "true";
  process.env.VITE_API_BASE_URL = "mock";

  const result = await build({
    root: CLIENT_DIR,
    configFile: path.join(CLIENT_DIR, "vite.config.ts"),
    base: "./",
    logLevel: "warn",
    build: {
      write: false,
      cssCodeSplit: false,
      copyPublicDir: false,
      modulePreload: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });

  const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output ?? []);
  const chunks = outputs.filter((item) => item.type === "chunk");
  const entry = chunks.find((chunk) => chunk.isEntry);
  if (!entry) throw new Error("The design build produced no entry script.");
  if (chunks.length !== 1) {
    throw new Error(`The design build produced ${chunks.length} scripts; exactly 1 is needed to inline it.`);
  }

  const assets = outputs.filter((item) => item.type === "asset");
  const stray = assets.filter((asset) => !/\.(css|html)$/.test(asset.fileName));
  if (stray.length > 0) {
    throw new Error(`The design build emitted files that cannot be inlined: ${stray.map((a) => a.fileName).join(", ")}`);
  }

  const toText = (source) => (typeof source === "string" ? source : Buffer.from(source).toString("utf8"));
  return {
    appJs: entry.code,
    baseCss: assets
      .filter((asset) => asset.fileName.endsWith(".css"))
      .map((asset) => toText(asset.source))
      .join("\n"),
  };
}

async function main() {
  console.log("Building the Talon design app...");
  const { appJs, baseCss } = await buildDesignApp();
  const exportedAt = new Date().toISOString();
  const fingerprint = sourceFingerprint();
  // Lets the import notice when someone (usually an AI) edited the built-in styles
  // instead of the design section, so those edits are reported rather than lost silently.
  const baseHash = hashCss(baseCss);

  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  fs.mkdirSync(INBOX_DIR, { recursive: true });

  console.log("");
  for (const role of ROLES) {
    const designCss = readRoleCss(role);
    const html = buildDesignFile({
      role,
      meta: { exportedAt, sourceFingerprint: fingerprint, baselineHash: hashCss(designCss), baseHash },
      baseCss,
      designCss,
      appJs,
    });
    const outPath = path.join(OUTBOX_DIR, designFileName(role));
    fs.writeFileSync(outPath, html, "utf8");
    const sizeKb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
    console.log(`  ${ROLE_LABELS[role].padEnd(11)}${path.relative(REPO_DIR, outPath)}  (${sizeKb} KB)`);
  }

  console.log(`
Give each file to the teammate who owns that view. When an edited file comes back,
save it into ${path.relative(REPO_DIR, INBOX_DIR)}/ and run:

  npm run design:import`);
}

main().catch((error) => {
  console.error(`\nDesign export failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
