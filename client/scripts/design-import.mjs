#!/usr/bin/env node
// Imports design files returned by teammates after an external AI edited them.
//
//   npm run design:import                      imports every file saved in design/inbox/
//   npm run design:import -- <file> [<file>]   imports specific files from anywhere
//   npm run design:check                       shows what would change, writes nothing
//   npm run design:import:force                imports files that were held for a manual check
//
// Built to survive what AI tools and editors do to a file: the role is read from
// the file's details, its title, or its name; styles an AI added in extra <style>
// blocks are recovered in the order the browser applied them; and anything that
// can't be imported is reported, never dropped silently.

import fs from "node:fs";
import path from "node:path";
import { ROLES, ROLE_LABELS, normalizeCss, readDesignFile } from "../src/design/designFile.js";
import {
  IMPORTED_DIR,
  INBOX_DIR,
  REPO_DIR,
  findCssProblems,
  hashCss,
  lineDiff,
  readRoleCss,
  roleCssPath,
  sourceFingerprint,
} from "./design-lib.mjs";

const MAX_DIFF_LINES = 40;
const INDENT = "           ";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const explicitPaths = args.filter((arg) => !arg.startsWith("--"));

function show(file) {
  const relative = path.relative(REPO_DIR, file);
  return relative && !relative.startsWith("..") ? relative : file;
}

function report(tag, message) {
  const [first, ...rest] = message.split("\n");
  console.log(`${`[${tag}]`.padEnd(INDENT.length)}${first}`);
  for (const line of rest) console.log(`${INDENT}${line}`);
}

function resolveInput(input) {
  // npm runs this from client/, so try the directory the command was typed in first.
  const bases = [process.env.INIT_CWD, process.cwd(), REPO_DIR].filter(Boolean);
  const candidates = bases.map((base) => path.resolve(base, input));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function collectFiles() {
  if (explicitPaths.length > 0) return explicitPaths.map(resolveInput);
  if (!fs.existsSync(INBOX_DIR)) return [];
  return fs
    .readdirSync(INBOX_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
    .map((entry) => path.join(INBOX_DIR, entry.name));
}

function printDiff(before, after) {
  const changes = lineDiff(before, after);
  if (!changes) {
    console.log(`${INDENT}(too large to show line by line)`);
    return;
  }
  const added = changes.filter((change) => change.type === "+").length;
  console.log(`${INDENT}${added} line(s) added, ${changes.length - added} removed:`);
  for (const change of changes.slice(0, MAX_DIFF_LINES)) console.log(`${INDENT}  ${change.type} ${change.text}`);
  if (changes.length > MAX_DIFF_LINES) console.log(`${INDENT}  ... and ${changes.length - MAX_DIFF_LINES} more`);
}

/** The view, from the file's details first, then its title, then its file name. */
function resolveRole(design, file) {
  if (ROLES.includes(design.role)) return { role: design.role, source: "" };
  if (ROLES.includes(design.roleFromTitle)) return { role: design.roleFromTitle, source: "its page title" };
  const name = path.basename(file).toLowerCase();
  const matches = ROLES.filter((role) => name.includes(role));
  if (matches.length === 1) return { role: matches[0], source: "its file name" };
  return { role: null, source: "" };
}

function whyUnreadable(design) {
  if (design.looksLikeWord) {
    return `It was re-saved by Microsoft Word, which strips out the design. Ask for the original
HTML file to be edited by an AI coding tool and returned as HTML.`;
  }
  if (design.combinedCss) {
    return `It looks like it was rebuilt as a brand-new web page (often by an AI tool), so it is no
longer connected to the Talon screens. Ask the AI to edit only the CSS between the
YOUR DESIGN markers in the original file and preserve everything else.`;
  }
  return `This isn't a Talon design file, or it was damaged. Start again from the original
exported HTML file and ask the AI to return the complete edited HTML file.`;
}

function main() {
  const fromInbox = explicitPaths.length === 0;
  const files = collectFiles();

  if (files.length === 0) {
    console.log(
      fromInbox
        ? `No design files to import. Save the returned HTML files into:\n  ${INBOX_DIR}\nthen run this again.`
        : "No files were given."
    );
    return;
  }

  if (dryRun) console.log("Dry run: nothing will be written or moved.");

  const currentFingerprint = sourceFingerprint();
  const candidates = [];
  let problems = 0;

  for (const file of files) {
    if (!fs.existsSync(file)) {
      report("error", `${show(file)}\nFile not found.`);
      problems++;
      continue;
    }

    const design = readDesignFile(fs.readFileSync(file, "utf8"));
    const { role, source } = resolveRole(design, file);
    const noStyles = design.designCss === null && !design.combinedCss;
    // No design section and nothing but a file name to go on: this is a new page, not a Talon file.
    const rebuilt = design.designCss === null && source === "its file name";

    if (!role || noStyles || rebuilt) {
      report("error", `${show(file)}\n${whyUnreadable(design)}`);
      problems++;
      continue;
    }

    candidates.push({
      file,
      design,
      role,
      roleSource: source,
      needsReview: design.designCss === null,
      order: fs.statSync(file).mtimeMs,
    });
  }

  const archive = [];
  let imported = 0;

  for (const role of ROLES) {
    const forRole = candidates.filter((c) => c.role === role).sort((a, b) => b.order - a.order);
    if (forRole.length === 0) continue;

    const [latest, ...older] = forRole;
    const { design, roleSource, needsReview } = latest;
    const label = ROLE_LABELS[role];
    const target = roleCssPath(role);

    console.log(`\n${label} view  <-  ${show(latest.file)}`);
    for (const extra of older) {
      report("warning", `Also received an older ${label} file, which was ignored:\n${show(extra.file)}`);
      archive.push(extra.file);
    }

    const incoming = normalizeCss(design.combinedCss);
    const current = normalizeCss(readRoleCss(role));

    // Report everything that changed but can't be imported, so no work vanishes quietly.
    if (roleSource) {
      report("warning", `This file's Talon details were removed, so its role was taken from ${roleSource}.`);
    }
    if (design.designCss !== null && design.extraStyleCount > 0) {
      report(
        "warning",
        `Found ${design.extraStyleCount} extra style block(s) outside the design section (usually added by an AI).\nThey were included, in the order the browser applied them.`
      );
    }
    if (needsReview) {
      report(
        "warning",
        "The design section was missing, so the other styles in the file were used instead.\nThe page may have been rebuilt by an AI, so check the result closely."
      );
    }
    if (design.baseCss !== null && design.baseHash && hashCss(design.baseCss) !== design.baseHash) {
      report(
        "warning",
        `The app's built-in styles inside this file were edited. Only the view design section can be\nimported, so those edits were ignored. Ask the AI to edit only between the YOUR DESIGN markers.`
      );
    }
    if (design.addedMarkup) {
      report(
        "warning",
        "HTML was added to the page (probably by an AI). Only styles can be imported, so it was\nignored. If it was meant as a content change, ask your teammate to describe it instead."
      );
    }
    if (!design.hasApp) {
      report(
        "warning",
        "The app part of this file is missing or cut off, which happens when an AI returns a\nshortened file. The styles were still recovered."
      );
    }
    for (const problem of findCssProblems(incoming)) report("warning", problem);
    if (design.sourceFingerprint && design.sourceFingerprint !== currentFingerprint) {
      const when = design.exportedAt ? ` on ${new Date(design.exportedAt).toLocaleDateString()}` : "";
      report(
        "warning",
        `The app's screens have changed since this file was exported${when}.\nCheck the ${label} view afterwards in case a style targets something that moved.`
      );
    }

    if (incoming === current) {
      report("skipped", "These styles are already in the app.");
      archive.push(latest.file);
      continue;
    }

    const hasBaseline = Boolean(design.baselineHash);
    if (hasBaseline && hashCss(incoming) === design.baselineHash) {
      report(
        "skipped",
        `No design changes were found between the YOUR DESIGN markers. The original file may\nhave been returned unchanged. Left in place so you notice.`
      );
      continue;
    }

    // Three-way check against the stylesheet as it was when the file was exported.
    // Anything uncertain is held for a person to look at rather than overwritten.
    let hold = null;
    if (needsReview) {
      hold = {
        tag: "review",
        message: "Because the design section was missing, this import needs a manual check.\nReview the diff below; if it looks right, run npm run design:import:force.",
      };
    } else if (!hasBaseline) {
      hold = {
        tag: "review",
        message: `This file's export details are missing, so there's no way to tell whether the app's
styles also changed since it was sent. Review the diff below; if it looks right, run
npm run design:import:force.`,
      };
    } else if (hashCss(current) !== design.baselineHash) {
      hold = {
        tag: "conflict",
        message: `The ${label} styles in the app also changed after this file was exported, so importing
would overwrite those changes. Below is what importing would do. If this file should win
(for example it is the same designer's later work), run npm run design:import:force.`,
      };
    }

    if (hold && !force) {
      report(hold.tag, hold.message);
      printDiff(current, incoming);
      problems++;
      continue;
    }

    printDiff(current, incoming);
    if (dryRun) {
      report("dry run", `Would update ${show(target)}`);
      continue;
    }
    fs.writeFileSync(target, `${incoming}\n`, "utf8");
    report("imported", `Updated ${show(target)}`);
    archive.push(latest.file);
    imported++;
  }

  if (fromInbox && !dryRun && archive.length > 0) {
    fs.mkdirSync(IMPORTED_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const file of archive) {
      fs.renameSync(file, path.join(IMPORTED_DIR, `${stamp}_${path.basename(file)}`));
    }
    console.log(`\nMoved ${archive.length} processed file(s) to ${show(IMPORTED_DIR)}`);
  }

  if (imported > 0) {
    console.log('\nNext: run "npm run dev:client", check each updated view, then commit its stylesheet.');
    console.log('Run "npm run design:export" before sending out another round.');
  }
  if (problems > 0) process.exitCode = 1;
}

main();
