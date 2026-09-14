// Helpers shared by design-export.mjs and design-import.mjs.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE_LABELS, normalizeCss } from "../src/design/designFile.js";

export const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_DIR = path.resolve(CLIENT_DIR, "..");
export const DESIGN_DIR = path.join(REPO_DIR, "design");
export const OUTBOX_DIR = path.join(DESIGN_DIR, "outbox");
export const INBOX_DIR = path.join(DESIGN_DIR, "inbox");
export const IMPORTED_DIR = path.join(INBOX_DIR, "imported");
export const ROLE_CSS_DIR = path.join(CLIENT_DIR, "src", "styles", "roles");

export function designFileName(role) {
  if (role === "login") return "Talon-Login-Welcome-Design.html";
  return `Talon-${ROLE_LABELS[role]}-Design.html`;
}

export function roleCssPath(role) {
  if (role === "login") return path.join(CLIENT_DIR, "src", "styles", "login.css");
  return path.join(ROLE_CSS_DIR, `${role}.css`);
}

export function readRoleCss(role) {
  const file = roleCssPath(role);
  if (!fs.existsSync(file)) throw new Error(`Missing design stylesheet: ${path.relative(REPO_DIR, file)}`);
  return fs.readFileSync(file, "utf8");
}

/** Short content hash of a stylesheet, ignoring line endings and outer whitespace. */
export function hashCss(css) {
  return crypto.createHash("sha256").update(normalizeCss(css)).digest("hex").slice(0, 16);
}

// The files that decide what markup and class names a design stylesheet styles.
// Role stylesheets are deliberately excluded: importing one designer's work must
// not make every other designer's file look out of date.
const FINGERPRINT_SOURCES = ["src/App.tsx", "src/styles.css", "src/components", "src/pages"];

/** Fingerprint of the app's screens, used to warn when a file predates a UI change. */
export function sourceFingerprint() {
  const files = [];
  for (const source of FINGERPRINT_SOURCES) {
    const absolute = path.join(CLIENT_DIR, source);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isFile()) {
      files.push(absolute);
      continue;
    }
    for (const entry of fs.readdirSync(absolute, { recursive: true })) {
      const full = path.join(absolute, String(entry));
      if (fs.statSync(full).isFile()) files.push(full);
    }
  }

  const relative = (file) => path.relative(CLIENT_DIR, file).split(path.sep).join("/");
  files.sort((a, b) => (relative(a) < relative(b) ? -1 : relative(a) > relative(b) ? 1 : 0));

  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(`${relative(file)}\0${fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n")}\0`);
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * Plain-language warnings about CSS a browser will partly ignore. These never
 * block an import: the designer saw exactly this CSS rendered in the same browser
 * engine, so importing it reproduces what they approved.
 */
export function findCssProblems(css) {
  let depth = 0;
  let line = 1;
  let inComment = false;
  let quote = null;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];
    if (ch === "\n") line++;

    if (inComment) {
      if (ch === "*" && next === "/") {
        inComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote || ch === "\n") quote = null;
      continue;
    }

    if (ch === "/" && next === "*") {
      inComment = true;
      i++;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth < 0) return [`There is an extra "}" on line ${line}.`];
    }
  }

  const problems = [];
  if (inComment) problems.push("A /* comment */ is never closed, so everything after it is ignored.");
  if (depth > 0) problems.push(`${depth} "{" never closed, so rules after it may be ignored.`);
  return problems;
}

/** Line-level diff (longest common subsequence). Returns null for very large inputs. */
export function lineDiff(before, after) {
  const a = normalizeCss(before).split("\n");
  const b = normalizeCss(after).split("\n");
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return null;

  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const changes = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      changes.push({ type: "-", text: a[i++] });
    } else {
      changes.push({ type: "+", text: b[j++] });
    }
  }
  while (i < n) changes.push({ type: "-", text: a[i++] });
  while (j < m) changes.push({ type: "+", text: b[j++] });
  return changes;
}
