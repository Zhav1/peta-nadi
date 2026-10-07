# Phase 7 learnings: Interactive Guided Demo Mode

This document summarizes the context, concerns, constraints, issues found, and fixes tried during the development of Phase 7.

## Context & Environment

1. **Next.js 14 Build Pipeline**:
   - Production builds in Next.js execute strict ESLint checks and type checking by default. Any warnings (such as unused variables, unused imports, or `any` types) will cause the compiler to exit with code 1, failing the build.
   
2. **FastAPI & Supabase Offline Support**:
   - `DEMO_OFFLINE=true` enables running presentations without requiring live Redis or Supabase credentials. This is handled by routing requests to an in-memory `DEMO_STORE` dict inside `demo_router.py`.

---

## Issues Found & Fixes Tried

### 1. TypeScript Strict Property Types
- **Issue**: Modifying `updatedStatuses` in `useDemoState.ts` caused a type mismatch when loops or assignments tried to set properties from `'pending'` to `'done'`.
- **Fixes Tried**:
  - *Failed*: Using `as const` on property definitions constrained the types to literally only `'pending'`.
  - *Failed*: A loop using `Object.keys(updatedStatuses).forEach((k) => ...)` caused index signature errors in strict mode because `Object.keys` returns `string[]`.
  - *Succeeded*: Declaring `const updatedStatuses: Record<string, 'pending' | 'running' | 'done'>` and explicitly assigning properties directly (`updatedStatuses.DataCollectionAgent = 'done'`).

### 2. Next.js App Router Search Params
- **Issue**: Using `useSearchParams()` directly in page components (like the mobile remote page at `/demo-remote`) without a `<Suspense>` boundary causes Next.js to throw de-optimization warnings during static optimization, which fails production compilation.
- **Succeeded**: Wrapped `DemoRemoteClient` inside a `<Suspense>` block in `DemoRemotePage` to ensure safe static compilation.

### 3. ESLint Strict Any Check
- **Issue**: Declaring `replay: (crisisId: string) => request<any>(...)` in `api.ts` triggered the `@typescript-eslint/no-explicit-any` rule, failing the build.
- **Succeeded**: Changed the type signature to return `unknown`, and cast the result in the calling hook via `(await api.demo.replay(crisisId)) as ReplaySnapshot;`. This kept both the API definition and the state hook 100% type-safe and clean.

### 4. ESLint React Unescaped Quotes
- **Issue**: Unescaped double quotes `"` in JSX (e.g. `"{summary || ...}"`) triggered the `react/no-unescaped-entities` rule, which failed the compilation.
- **Succeeded**: Replaced unescaped quotes with standard React entities `&quot;`.

---

## Concerns & Constraints

- **Mobile Remote Syncing Pacing**:
  - The presenter remote page at `/demo-remote` polls `/api/demo/status` every 2 seconds to check if the stage has changed. While simpler than a dedicated WebSocket or SSE connection, this introduces a maximum ~2-second lag when advancing stages via desktop.
- **QR Code Client-side Render**:
  - Generating QR codes client-side in the browser requires the `qrcode` library. This is dynamic and requires the hostname (`window.location.hostname`) to resolve correctly so the phone can connect to the server. Presenters must be on the same local network as the hosting server.
