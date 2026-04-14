# Google Apps Script Project Development Process

A methodical process for building reliable Google Apps Script projects from architecture docs through verified, deployable code. Written from hard-won lessons — what to do, what to watch for, and what breaks if you skip steps.

---

## Phase 1: Understand the Environment Before Touching Code

GAS is not Node.js. It is not browser JavaScript. It is a unique runtime with specific constraints that will silently break patterns from other environments. Internalize these before writing a single line:

### Runtime Reality
- All `.js` files in the project are loaded into a **single global scope**. There are no modules. `import`/`export` do not exist at runtime. Every function is global.
- If the build pipeline is a simple file copy (no Webpack, no Rollup, no TypeScript transpilation), then what you write in `src/` is exactly what runs in GAS. No transforms. TypeScript `namespace`, `export`, generics, type annotations — none of it will work unless there is an actual transpilation step configured.
- Execution time limit: 6 minutes per run (30 min for Workspace Business/Enterprise). Plan for this on any operation that touches many sheets.

### What You Cannot Use
- `npm` packages at runtime (only GAS built-in services and Advanced Services)
- Browser globals (`window`, `document`, `fetch`, `setTimeout`)
- ES modules (`import`/`export`)
- `async`/`await` (GAS is synchronous)

### What You Must Verify First
Before writing any architecture doc or code:
1. Read `appsscript.json` for the runtime version (V8 or Rhino), timezone, OAuth scopes, and enabled Advanced Services.
2. Read the build script to understand if there is transpilation. A file copy script means no TypeScript, no JSX, no module bundling.
3. Check `jsconfig.json` or `tsconfig.json` for IDE type support — this is different from runtime capability.

---

## Phase 2: Document the Data Model Before the Logic

You cannot build reliable automation without knowing the exact shape of the data. For spreadsheet-based projects:

### Map Every Tab
For each sheet tab, document:
- The exact column headers (these are your API — get them wrong and `indexOf()` returns -1)
- Data types per column (string, date, time, boolean, dropdown)
- Which columns are populated by forms vs. by scripts vs. by humans
- Which columns are lookup keys (the field used to match across tabs)

### Map Every Connected Form
For each Google Form linked to the spreadsheet:
- The exact question text (this becomes the column header in the response tab, or the key in `e.namedValues`)
- The question type (dropdown, text, date, multiple choice)
- Whether the form is linked to its own response tab or shares one

### Identify the Header Name Problem Early
This is a common trap: the Sheets Structure documentation says the tab header is `"Full Name"`, but the Google Form question text is `"Your Full Name"`. When forms submit natively, the response sheet uses the **form question text** as headers, not whatever you documented as the "tab header." Decide early which is the source of truth and make all code use `headers.indexOf('...')` with the **actual** text, never hardcoded column indexes.

---

## Phase 3: Verify Every API Method Against Official Documentation

This is the most important lesson from this process. **LLM-generated code examples frequently contain hallucinated methods.** Methods that sound plausible, have reasonable parameter signatures, and would make total sense if they existed — but they don't.

### The Verification Protocol
For every GAS method used in architecture docs or code examples:

1. **Check local type definitions first.** If `@types/google-apps-script` is installed, read the `.d.ts` file for the service you're using. This is the fastest authoritative check.

2. **Search official Google documentation.** Use the Google Developer Knowledge MCP tool or search `developers.google.com/apps-script/reference` directly. Search for the exact method name.

3. **Verify the method signature.** Even if the method exists, verify:
   - Parameter order (GAS methods sometimes have unusual parameter ordering, like `copyFormatToRange(sheet, column, columnEnd, row, rowEnd)` — note column comes before row)
   - Parameter types (1-based vs 0-based indexing, Sheet object vs grid ID)
   - Return type (does it return void, the object for chaining, or a value?)

4. **Check for the method you wish existed.** If you find yourself thinking "there must be a method for this" — search for it explicitly. If you can't find it in the official docs, it doesn't exist. Build a workaround using methods that do exist. Example: `copyDataValidationsToRange()` does not exist. The correct approach is `Range.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false)`.

### Common Hallucination Patterns
Watch for these in LLM-generated GAS code:
- Methods that combine two real methods into one convenient call (e.g., `copyFormatAndValidationsTo()`)
- Methods from the Sheets REST API appearing as SpreadsheetApp methods (they're different APIs)
- Node.js patterns appearing in GAS (Promises, callbacks, event emitters)
- TypeScript-only constructs in plain JS codebases

---

## Phase 4: Validate Cross-Cutting Concerns

After verifying individual methods, validate the patterns that span multiple operations:

### Batch Operations
The #1 performance rule in GAS. Every code example must follow this pattern:
1. Read all data into memory with one `getValues()` call
2. Process in-memory using native JS array methods
3. Write back with one `setValues()` call

Audit every loop in the codebase. If you see `getValue()`, `setValue()`, or `setNote()` inside a `for` loop, it's a performance bug. Refactor to batch.

### Concurrency
If multiple triggers can fire simultaneously (especially `onFormSubmit` with many users):
- Determine if concurrent writes to the same sheet are possible
- If yes, decide: LockService, or architectural redesign (queue-based approach)
- If using LockService: `SpreadsheetApp.flush()` MUST be called before `releaseLock()`. This is explicitly stated in Google's official docs for `releaseLock()` but almost never included in example code.

### Timezone
GAS has a persistent timezone trap:
- The spreadsheet has a timezone (set in `appsscript.json`, e.g., `America/Chicago`)
- JavaScript `Date` objects in GAS default to `America/Los_Angeles` for string methods (`toLocaleDateString()`, `getHours()`, etc.)
- These do NOT match. Every date comparison or display must use `Utilities.formatDate(date, timezone, format)` for the correct timezone.

### Date Parsing
Custom date formats (like `M/D h:mm a` without a year) will fail with `new Date()`. Build and test a custom parser. Also: Google Sheets may store what looks like a date string as an actual JavaScript `Date` object internally. Check `instanceof Date` before calling `toString()`.

---

## Phase 5: Read All Parts Together for Consistency

After verifying each section individually, read the entire set of architecture docs in sequence and check:

### Naming Consistency
- Are tab names identical everywhere? (`"Pink Sheet"` vs `"Pink Sheets"` is a runtime error)
- Are function names consistent across references? (Part 2 calls `processPendingPinkSheets()`, does Part 3 define it?)
- Are attendance state strings identical? (`"Excused"` vs `"excused"` matters)

### Logic Consistency
- Does Part 1 say "always use LockService" while Part 2 says "we're dropping LockService"? Reconcile.
- Does one part filter for `status !== "Present"` while another filters for `status !== "Present" && status !== "Excused"`? Decide which is correct.
- Are there functions referenced but never defined? Track them as implementation gaps.

### Language Consistency
- If the project uses plain JS, are there TypeScript examples hiding in later sections?
- Are code blocks tagged with the correct language (`javascript` not `typescript`)?
- Do examples use `var` consistently, or mix `var`/`let`/`const`? (GAS V8 supports all three, but be consistent)

---

## Phase 6: Produce a Single-Source Summary

After all verification and corrections, produce one comprehensive reference document that:

1. **Describes the environment** — language, runtime, build pipeline, constraints
2. **Maps the data model** — every tab, every column, every form
3. **Lists verified API patterns** — with correct code examples and parameter signatures
4. **Documents architectural decisions** — and the reasoning behind them (e.g., why queue-based instead of LockService)
5. **Catalogs known pitfalls** — timezone traps, method gotchas, date parsing quirks
6. **Tracks implementation gaps** — functions referenced but not yet built

This document is the handoff artifact. Any new session, agent, or developer should be able to read it and start implementing features without re-deriving context.

---

## Appendix: GAS-Specific Checklist

Run through this before considering any GAS code "done":

- [ ] No `import`/`export` statements (global scope only)
- [ ] No TypeScript syntax (unless transpilation is configured and verified)
- [ ] No single-cell `getValue()`/`setValue()` inside loops
- [ ] `SpreadsheetApp.flush()` called before `releaseLock()` (if using LockService)
- [ ] `SpreadsheetApp.flush()` called after bulk operations across multiple tabs
- [ ] All `Date` formatting uses `Utilities.formatDate()` with explicit timezone
- [ ] `e.namedValues` preferred over `e.values` for form triggers
- [ ] `setNote()`/`setNotes()` called AFTER `setValues()` (not before — setValues overwrites notes)
- [ ] Every method name verified against official docs or type definitions
- [ ] Column lookups use `headers.indexOf('...')`, never hardcoded indexes
- [ ] Tab name strings match the exact sheet tab names (case-sensitive)
- [ ] Functions called from custom menus are globally accessible (not inside namespaces or IIFEs)
- [ ] `getLastRow()` used for data operations, `getMaxRows()` only when the full grid is needed
- [ ] Error handling on `getSheetByName()` (returns `null` if tab doesn't exist)
- [ ] OAuth scopes in `appsscript.json` are minimal (`.currentonly` not generic)
- [ ] 6-minute execution limit considered for operations touching many sheets

---

## Appendix: Recommended MCP / Tool Usage

When building GAS projects with AI assistance:

### For API Verification
- **`mcp__google-dev-knowledge__search_documents`**: Search for method names, parameter signatures, enum values. This is your primary verification tool. Search for the exact method name, not a description of what you want.
- **`mcp__google-dev-knowledge__get_documents`**: Fetch the full page when search snippets aren't detailed enough. Use the `parent` field from search results.

### For Live Testing
- **`mcp__google-apps-script__script_run`**: Execute a function in the deployed project. Useful for smoke-testing after pushing code.
- **`mcp__google-apps-script__script_projects_get_content`**: Read what's currently deployed. Compare against local `src/` to catch drift.
- **`mcp__google-apps-script__get_script_metrics`** / **`list_script_processes`**: Check execution history and error logs after a deployment.

### For Deployment
- **`clasp push`** (via CLI): Standard deployment path. Copies `dist/` to GAS.
- **`mcp__google-apps-script__update_script_content`**: Push file content directly without clasp. Useful for quick iterations, but doesn't go through the build pipeline.

### Search Strategy
When verifying a method:
1. Search for the exact method name: `"Google Apps Script Range copyDataValidationsToRange"`
2. If no results, the method likely doesn't exist. Search for what you're trying to accomplish: `"Google Apps Script copy data validation from one range to another"`
3. The second search will reveal the real method (e.g., `copyTo` with `CopyPasteType`)
