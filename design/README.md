# Design handoff

Talon produces four self-contained HTML design files: one for the shared Login/Welcome screen and one
for each dashboard role (Student, Supervisor, and Admin). A teammate can open their file in a browser
as a working prototype with sample data. They can give the same file to an external AI coding tool,
ask for visual changes, open the returned file to review it, and return that single file to the project
owner.

Talon does not include a design editor or file-sharing integration. File exchange happens outside the
application using whatever method the team prefers.

## Workflow

1. Run `npm run design:export` from the repository root.
2. Take the appropriate file from `design/outbox/` and give it to the teammate responsible for that
   view.
3. The teammate opens the file in a browser to inspect the working prototype.
4. The teammate gives the complete HTML file to an AI coding tool and describes the desired look.
5. The AI edits the CSS between the `YOUR DESIGN STARTS HERE` and `YOUR DESIGN ENDS HERE` markers and
   returns the complete HTML file.
6. The teammate opens the returned file in a browser and repeats step 4 if more visual changes are
   needed.
7. Put the final returned file in `design/inbox/` and run `npm run design:import`.
8. Run `npm run dev:client`, verify the updated view, and commit its stylesheet.

Each exported file contains the real Talon frontend running against made-up sample data. Dashboard
files sign in automatically as their role; the Login/Welcome file stays signed out. The files have no
connection to the deployed API and contain no real employee or payroll data.

## What to tell the AI

The exported file already contains instructions for an AI assistant. A teammate only needs to attach
the complete file and describe the appearance they want. A useful request is:

> Edit this Talon role prototype to use a modern, accessible design with the colors, spacing, and
> layout I describe below. Follow the instructions inside the file. Return the complete edited HTML
> file so I can open it in my browser and give it back to the project owner.

The AI must preserve the compiled application and edit only the role CSS between the design markers.
It may change colors, type, spacing, card layout, button appearance, tables, and responsive behavior.
The importer cannot apply new fields, buttons, wording, or application behavior because those require
source-code changes.

## Design isolation

Each view has its own stylesheet:

```text
client/src/styles/login.css
client/src/styles/roles/student.css
client/src/styles/roles/supervisor.css
client/src/styles/roles/admin.css
```

The logged-out app loads `login.css`. After sign-in, it loads only that user's role stylesheet. A
Student design therefore cannot change the Login, Supervisor, or Admin views. Shared application
defaults remain in `client/src/styles.css`.

## Commands

```bash
npm run design:export                        # create all four standalone HTML files
npm run design:import                        # import every HTML file in design/inbox/
npm run design:check                         # show the changes without writing them
npm run design:import -- path/to/file.html   # import one returned file from anywhere
npm run design:import:force                  # accept a reviewed conflict
```

Processed files from `design/inbox/` move to `design/inbox/imported/`. The generated handoff files are
ignored by Git; the view stylesheet produced by the import is the file to commit.

## Import safeguards

The importer identifies the role from the file metadata, title, or filename and shows a CSS diff
before applying it. It also reports extra style blocks, edits to the shared base styles, added HTML,
missing compiled application code, invalid-looking CSS, and screens that changed after export.

If the view stylesheet in the repository changed after the file was exported, import stops instead of
overwriting newer work. Review the displayed diff and run `npm run design:import:force` only when the
returned file should win.

If an AI rebuilt the prototype as a new page or returned only part of the file, start again with the
original export. Ask it to preserve the entire HTML file and edit only the CSS between the two design
markers.

Run `npm run design:export` again whenever the application screens change or after importing a design.
New exports include the latest role styles and current application markup.
