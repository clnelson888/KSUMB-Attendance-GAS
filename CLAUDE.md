# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google Apps Script (GAS) starter template for building Google Workspace add-ons and automation scripts. Code is written in ES6+ JavaScript in `src/`, built to `dist/`, then deployed to Google Apps Script via `clasp`.

## Commands

```bash
npm run build      # Copy src/ files to dist/ (no transpilation)
npm run deploy     # Build + push to Google Apps Script via clasp
npm run lint       # Run ESLint on src/
npm run format     # Run Prettier on src/
npm run test       # Run Jest unit tests
```

To deploy, the `scriptId` in `.clasp.json` must be set to an actual GAS project ID.

## Architecture

**Build pipeline:** `src/` → `scripts/build.js` → `dist/` → `clasp push` → Google Apps Script

- `src/code.js` — Main entry point; all GAS trigger functions go here (e.g., `onOpen`, `onEdit`)
- `src/html/` — HTML files for UI dialogs/sidebars
- `dist/` — Build output pushed to GAS; do not edit directly
- `dist/appsscript.json` — GAS manifest (OAuth scopes, advanced services, runtime=V8)
- `scripts/build.js` — Simple file copy script; no bundling or transpilation

**GAS execution model:** All `.js` files in `dist/` are loaded into a single global scope by the GAS runtime. There is no module system at runtime — `import`/`export` are not supported in GAS. Functions must be globally accessible to act as triggers or be called from other files.

## Key Configuration

- **Runtime:** V8 (modern JS engine, supports ES6+)
- **Time zone:** America/Chicago
- **Advanced services enabled:** Google Sheets API v4 (available as `Sheets` global)
- **OAuth scopes:** `spreadsheets.currentonly`, `forms.currentonly` — expand in `dist/appsscript.json` as needed
- **`jsconfig.json`** includes `@types/google-apps-script` for IDE autocompletion of GAS globals (`SpreadsheetApp`, `FormApp`, etc.)

## Code Style

Prettier config (in `package.json`): single quotes, 120-char line width, 2-space indent, ES5 trailing commas. ESLint flat config (`eslint.config.js`) uses `eslint-plugin-googleappsscript` to expose all GAS globals and `eslint-config-prettier` to prevent rule conflicts.

## AI Coding Resources

When writing or reviewing GAS code, consult the following in priority order:

### Type Definitions (local — use first)
The installed `@types/google-apps-script` package provides authoritative type definitions for every GAS service. Key files in `node_modules/@types/google-apps-script/`:
- `google-apps-script.spreadsheet.d.ts` — SpreadsheetApp, Sheet, Range, etc.
- `google-apps-script.forms.d.ts` — FormApp, Form, Item types
- `google-apps-script.drive.d.ts` — DriveApp, File, Folder
- `google-apps-script.gmail.d.ts` — GmailApp, GmailMessage, etc.
- `google-apps-script.script.d.ts` — ScriptApp, triggers, PropertiesService
- `google-apps-script.html.d.ts` — HtmlService, HtmlOutput, templating
- `google-apps-script-events.d.ts` — Event object shapes for all trigger types
- `apis/sheets_v4.d.ts` — Advanced Sheets Service (used as `Sheets` global)

### MCP Tools (available in this session)
- **`mcp__google-apps-script__script_run`** — Execute a GAS function in a deployed project (useful for smoke-testing deployed code)
- **`mcp__google-apps-script__update_script_content`** — Push file content directly to a GAS project without using clasp
- **`mcp__google-apps-script__script_projects_get_content`** — Read current files in a deployed GAS project
- **`mcp__google-apps-script__get_script_metrics`** / **`list_script_processes`** — Inspect execution history and errors

### Google Official Documentation (web search)
When type definitions are insufficient, search or fetch from:
- GAS reference: `developers.google.com/apps-script/reference`
- Service-specific guides: `developers.google.com/apps-script/guides`
- Workspace REST APIs (used via UrlFetchApp or Advanced Services): `developers.google.com/workspace`

### GAS-Specific Constraints to Remember
- No `import`/`export` at runtime — all files share a single global scope
- No `npm` packages at runtime — only GAS built-ins and Advanced Services
- Execution time limit: 6 minutes per run (30 min for Workspace Business/Enterprise)
- `console.log` works (maps to Stackdriver); `Logger.log` is legacy but still valid
- HTML dialogs communicate with server via `google.script.run` (async, no return value directly)
- Use `PropertiesService` for persistent config; `CacheService` for short-lived data
- Triggers (time-based, onEdit, onOpen, etc.) must be registered in GAS, not in code
