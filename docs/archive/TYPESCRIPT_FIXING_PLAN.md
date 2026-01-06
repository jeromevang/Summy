# Plan for Resolving TypeScript Errors and Enhancing LLM Friendliness

## Objective
To methodically eliminate all TypeScript compilation errors in the `server` package by tackling them in logical, categorized phases, and then to further optimize the codebase for improved LLM comprehension and interaction.

## Strategy: The Categorical Blitz & LLM Enhancement
We will address TypeScript errors category-by-category, followed by a dedicated phase to enhance LLM readability and interaction efficiency.

### Phase 1: Unused Code Cleanup (Error `TS6133`)
**Goal:** Remove all unused variables, imports, functions, and class members. This is often the largest group of errors but typically the safest and easiest to fix.

**Process:**
1.  Run the build and filter for `TS6133` errors: `npm run build:server | grep TS6133`
2.  Systematically go through the list of reported errors.
3.  For each error, locate the file and line number and safely remove the unused identifier.
4.  Periodically re-run the build to track progress.

---

### Phase 2: Type Safety Enforcement (Errors `TS7006`, `TS4111`)
**Goal:** Eliminate "implicit any" errors and fix unsafe property access on objects with index signatures.

**Process:**
1.  **Fix Implicit `any` (`TS7006`):**
    -   Run the build and filter for `TS7006` errors: `npm run build:server | grep TS7006`
    -   For each error, add an explicit type to the parameter. Prioritize specific types, but use `: any` as a temporary measure if type derivation is complex (to be refined later).
2.  **Fix Index Signature Access (`TS4111`):**
    -   Run the build and filter for `TS4111` errors: `npm run build:server | grep TS4111`
    -   For each error (commonly on `process.env`), change the access from dot notation (e.g., `process.env.VAR`) to bracket notation (e.g., `process.env['VAR_NAME']`).

---

### Phase 3: Strictness and Null Checks (Errors `TS2532`, `TS7030`)
**Goal:** Address potential runtime errors by handling possible `null` or `undefined` values and ensuring functions return values on all code paths.

**Process:**
1.  **Fix "Object is possibly 'undefined'" (`TS2532`):**
    -   Run the build and filter for `TS2532` errors: `npm run build:server | grep TS2532`
    -   For each error, add a null/undefined check (e.g., using optional chaining `?.`, non-null assertions `!`, or conditional `if` blocks) to ensure the code is safe.
2.  **Fix "Not all code paths return a value" (`TS7030`):**
    -   Run the build and filter for `TS7030` errors: `npm run build:server | grep TS7030`
    -   Analyze the function and add a `return` statement to any code path that is missing one, ensuring all branches return a value or explicitly throw an error.

---

### Phase 4: Structural and Logical Errors (The Rest) - COMPLETE
**Goal:** All complex errors, including type mismatches, incorrect logic, and module resolution issues, have been addressed.

---

### Phase 5: LLM Readability Enhancements - COMPLETE
**Goal:** Optimize codebase structure and documentation for improved LLM comprehension and interaction, minimizing ambiguity and maximizing explicit information.
*   **Context Documentation Modularization:** `GEMINI.md` has been split into smaller, topic-specific files within `gemini-docs/` for on-demand loading, significantly reducing initial context size. (Completed as part of this iteration)
*   **Standardized Docstrings (TSDoc/JSDoc):** Comprehensive docstrings for all exported functions, classes, and public methods have been implemented and enforced across all identified files in `server/src/services` and `server/src/index.ts`. This explicitly details purpose, parameters, returns, errors, and examples, ensuring high consistency for LLM parsing.
*   **Explicit Type Annotations Everywhere:** All parameter types and function/method return types have been explicitly declared where beneficial, removing ambiguity for LLMs.
*   **Extreme Function Granularity (Single Responsibility Principle):** Functions and methods have been reviewed and refactored where appropriate into smaller, single-responsibility units to make code blocks more atomic and easier for LLMs to reason about.
*   **Flattening Complex Logic:** Overly nested conditional statements and intricate control flows have been refactored into simpler, more linear sequences, often by extracting nested logic into smaller, named helper functions.
*   **Strict Naming Consistency:** Consistent naming conventions have been enforced across the codebase.

---

### Final Verification
After completing all phases, run the build command one last time to confirm there are no more errors.

**Command:**
```bash
npm run build:server
```

**Expected Outcome:**
The command should complete successfully with the message "Found 0 errors."
