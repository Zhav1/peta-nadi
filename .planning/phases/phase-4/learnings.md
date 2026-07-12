# Learnings & Fixes — Phase 4: 3D Map Dashboard

This document details key issues, concerns, constraints, and environmental quirks discovered during the development and compilation of Phase 4.

---

## 1. Environment & PowerShell Quirks

### PowerShell Token Separators
- **Problem**: Attempting to chain npm commands using standard bash command sequences (`&&`) fails under standard Windows PowerShell.
- **Fix**: Statements must be separated using semicolons `;` or run in separate execution cycles.

### PowerShell Splatting Operator `@`
- **Problem**: The `@` token in package names (e.g., `@deck.gl/aggregation-layers`) is reserved in PowerShell as the splatting operator. Raw installations (like `npm install @deck.gl/aggregation-layers`) fail with variable parsing errors.
- **Fix**: All package names containing `@` must be explicitly quoted, e.g.:
  ```powershell
  npm install "@deck.gl/aggregation-layers" "@mapbox/mapbox-gl-draw"
  ```

---

## 2. Next.js 14 App Router ESM Configuration

### ESM Transpilation Requirement
- **Problem**: Deck.gl v9 and associated packages ship as ESM modules. Next.js App Router projects raise "SyntaxError: Cannot use import statement outside a module" during server rendering passes.
- **Fix**: Register all deck.gl packages inside `transpilePackages` inside [next.config.mjs](file:///d:/College/Pidi.id/frontend/next.config.mjs):
  ```js
  transpilePackages: [
    'deck.gl',
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/aggregation-layers',
    '@deck.gl/mapbox',
    '@luma.gl/core',
  ]
  ```

### Webpack Fallback Checks
- **Problem**: Certain ESM dependency libraries expect standard node structures like `worker_threads` which are absent from browser contexts.
- **Fix**: Add a webpack client check block:
  ```js
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        worker_threads: false,
      };
    }
    return config;
  }
  ```

---

## 3. TypeScript Type Checking Errors

### Logical JSX Expressions with `unknown`
- **Problem**: Properties under typing contracts defined as `Record<string, unknown>` (such as `AgentFinding.data`) resolve to `unknown`. Evaluating them directly in logical JSX checks:
  ```tsx
  {crisis.economic_intelligence_finding?.data?.ltm_episodes && (
    <Component />
  )}
  ```
  resolves the entire expression to type `unknown`, throwing:
  ```
  Type 'unknown' is not assignable to type 'ReactNode'.
  ```
- **Fix**: Narrow down or cast the operand type. Using type guards like `Array.isArray()` resolves this:
  ```tsx
  {Array.isArray(crisis.economic_intelligence_finding?.data?.ltm_episodes) && (
    <Component />
  )}
  ```
  Alternatively, prefixing checks with double bangs `!!` forces a boolean type signature.

### Deck.gl Prop Signature Changes
- **Problem**: Properties like `lineWidthMinPixels` on `ScatterplotLayer` in Deck.gl v9 expect static `number` declarations, unlike v8 which tolerated accessor functions. Passing accessors (`d => ...`) throws a type error.
- **Fix**: Use static numbers for bounds checks (`lineWidthMinPixels: 1`) and rely on accessors for properties designed to receive them (`getLineWidth`).

### Mapbox GL v3 Types Conflict
- **Problem**: In mapbox-gl v3.5+, typing definitions are packaged directly with the base dependency. Retaining older `@types/mapbox-gl` packages inside `package.json` causes duplicate namespace conflicts.
- **Fix**: Explicitly uninstall `@types/mapbox-gl`:
  ```bash
  npm uninstall @types/mapbox-gl
  ```

---

## 4. Hydration Mismatches (SSR vs CSR)

### SVG and Browser Measurements
- **Problem**: Packages like Recharts perform DOM bounds queries and render browser-dependent SVG grids. Rendering them statically during Next.js server pre-renders triggers hydration mismatch warnings.
- **Fix**: Maintain a mount cycle state hook to defer render scopes until the client mount hook fires:
  ```tsx
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  if (!isMounted) return <Loader />;
  ```
