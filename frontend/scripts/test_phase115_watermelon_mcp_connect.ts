import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('=== PHASE 115 WATERMELON MCP CONNECT AUTOMATED VERIFICATION SUITE ===\n');

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const baseUiDir = path.resolve(currentDir, '../components/base-ui');
const analyticsSectionFile = path.resolve(currentDir, '../components/dashboard/AnalyticsSection.tsx');

let passedTests = 0;
let totalTests = 0;

function runTest(suiteName: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`✅ PASS: ${suiteName}`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${suiteName}`);
    console.error(`   Error: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// SUITE 1: Select Primitive Contract (@base-ui/react/select)
// ---------------------------------------------------------------------------
runTest('Suite 1: Select primitive contract & exports', () => {
  const filePath = path.join(baseUiDir, 'select.tsx');
  assert.ok(fs.existsSync(filePath), 'select.tsx must exist in frontend/components/base-ui/');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Verify Base UI imports
  assert.ok(content.includes("from '@base-ui/react/select'"), 'Must import from @base-ui/react/select');
  assert.ok(!content.includes('shadcn'), 'Must not contain shadcn cli generator remnants');

  // Verify all required exports
  const expectedExports = [
    'export function Select',
    'export function SelectTrigger',
    'export function SelectValue',
    'export function SelectContent',
    'export function SelectItem',
    'export function SelectGroup',
    'export function SelectSeparator',
    'export function SelectLabel',
  ];
  for (const exp of expectedExports) {
    assert.ok(content.includes(exp), `select.tsx must export ${exp}`);
  }

  // Verify dark tactical styling contracts
  assert.ok(content.includes('bg-[#0c1017]'), 'SelectContent must use dark surface bg-[#0c1017]');
  assert.ok(content.includes('border-white/10'), 'Select components must use border-white/10');
  assert.ok(content.includes('cursor-pointer'), 'Interactive triggers/items must include cursor-pointer');
  assert.ok(content.includes('tabular-nums'), 'Select triggers and items must support tabular-nums');

  // Verify trigger composition safety (render and asChild)
  assert.ok(content.includes('render?:'), 'SelectTrigger must accept render prop');
  assert.ok(content.includes('asChild?:'), 'SelectTrigger must support asChild for backwards compatibility');
  assert.ok(content.includes('data-slot="select-trigger"'), 'SelectTrigger must include data-slot');
  assert.ok(!content.includes('text-[11px]'), 'Select must not use micro-text text-[11px], minimum text-xs required');

  // Verify positioning invariant: alignItemWithTrigger={false} for dropdown behavior
  assert.ok(content.includes('alignItemWithTrigger={false}'), 'Must specify alignItemWithTrigger={false} for standard dropdowns');
});

// ---------------------------------------------------------------------------
// SUITE 2: Chip Primitive Contract
// ---------------------------------------------------------------------------
runTest('Suite 2: Chip primitive contract, variants & status dots', () => {
  const filePath = path.join(baseUiDir, 'chip.tsx');
  assert.ok(fs.existsSync(filePath), 'chip.tsx must exist in frontend/components/base-ui/');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('export function Chip'), 'chip.tsx must export Chip function component');
  assert.ok(content.includes('data-slot="chip"'), 'Chip must specify data-slot="chip"');

  // Verify variants
  assert.ok(content.includes("'default'"), 'Must support default variant');
  assert.ok(content.includes("'outline'"), 'Must support outline variant');
  assert.ok(content.includes("'secondary'"), 'Must support secondary variant');
  assert.ok(content.includes("'status'"), 'Must support status variant');

  // Verify status dot support
  assert.ok(content.includes('statusDot'), 'ChipProps must support statusDot prop');
  assert.ok(content.includes('dotClassName'), 'ChipProps must support dotClassName prop');
  assert.ok(content.includes('bg-emerald-400'), 'Must support online emerald dot');
  assert.ok(content.includes('bg-amber-400'), 'Must support warning amber dot');
  assert.ok(content.includes('bg-rose-400'), 'Must support critical rose dot');
  assert.ok(content.includes('bg-slate-600'), 'Must support offline slate dot');
  assert.ok(content.includes('tabular-nums'), 'Chip must include tabular-nums');
  assert.ok(!content.includes('text-[11px]'), 'Chip must not use micro-text text-[11px], minimum text-xs required');
});

// ---------------------------------------------------------------------------
// SUITE 3: Card Primitive Contract
// ---------------------------------------------------------------------------
runTest('Suite 3: Card primitive contract & dark theme classes', () => {
  const filePath = path.join(baseUiDir, 'card.tsx');
  assert.ok(fs.existsSync(filePath), 'card.tsx must exist in frontend/components/base-ui/');
  const content = fs.readFileSync(filePath, 'utf-8');

  const expectedExports = [
    'export function Card',
    'export function CardHeader',
    'export function CardTitle',
    'export function CardDescription',
    'export function CardContent',
    'export function CardFooter',
  ];
  for (const exp of expectedExports) {
    assert.ok(content.includes(exp), `card.tsx must export ${exp}`);
  }

  assert.ok(content.includes('rounded-xl'), 'Card must have rounded-xl styling');
  assert.ok(content.includes('bg-[#0c1017]'), 'Card must have dark bg-[#0c1017]');
  assert.ok(content.includes('border-white/10'), 'Card must have border-white/10');
  assert.ok(content.includes('tabular-nums'), 'CardContent must enforce tabular-nums');
});

// ---------------------------------------------------------------------------
// SUITE 4: Empty Primitive Contract (Essential E2E role="status" hook)
// ---------------------------------------------------------------------------
runTest('Suite 4: Empty primitive contract & role="status" E2E hook', () => {
  const filePath = path.join(baseUiDir, 'empty.tsx');
  assert.ok(fs.existsSync(filePath), 'empty.tsx must exist in frontend/components/base-ui/');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('export function Empty'), 'empty.tsx must export Empty function component');
  
  // CRITICAL E2E CONTRACT ASSERTION
  assert.ok(
    content.includes("loading ? { role: 'status'") || content.includes("role: 'status'"),
    'Empty MUST include role="status" when loading=true for Playwright E2E compatibility'
  );
  assert.ok(content.includes('Memuat…'), 'Empty MUST render visible "Memuat…" text when loading=true');
  assert.ok(content.includes('Data tidak tersedia'), 'Empty default title must be "Data tidak tersedia"');
  assert.ok(content.includes('icon: Icon = Info'), 'Empty must support customizable icon component');
});

// ---------------------------------------------------------------------------
// SUITE 5: Skeleton Primitive Contract (h-11 and motion-safe pulse)
// ---------------------------------------------------------------------------
runTest('Suite 5: Skeleton primitive contract, aria-hidden & motion-safe pulse', () => {
  const filePath = path.join(baseUiDir, 'skeleton.tsx');
  assert.ok(fs.existsSync(filePath), 'skeleton.tsx must exist in frontend/components/base-ui/');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('export function Skeleton'), 'skeleton.tsx must export Skeleton component');
  assert.ok(content.includes('aria-hidden="true"'), 'Skeleton container MUST have aria-hidden="true"');
  assert.ok(content.includes('motion-safe:animate-pulse'), 'Skeleton must use motion-safe:animate-pulse');
  assert.ok(content.includes("'h-11'"), 'Skeleton default row height must be h-11');
});

// ---------------------------------------------------------------------------
// SUITE 6: Tooltip Primitive Contract (No hideWhenDetached & Non-Portal Support)
// ---------------------------------------------------------------------------
runTest('Suite 6: Tooltip primitive contract, no hideWhenDetached & portal toggle', () => {
  const filePath = path.join(baseUiDir, 'tooltip.tsx');
  assert.ok(fs.existsSync(filePath), 'tooltip.tsx must exist in frontend/components/base-ui/');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Verify Base-UI 1.9.0 Invariant: NEVER pass hideWhenDetached in code/props
  const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  assert.ok(
    !codeWithoutComments.includes('hideWhenDetached'),
    'CRITICAL INVARIANT VIOLATION: Tooltip must NEVER pass hideWhenDetached (does not exist in @base-ui/react 1.9.0)'
  );

  // Verify exports
  assert.ok(content.includes('export function Tooltip'), 'Must export Tooltip');
  assert.ok(content.includes('export function TooltipTrigger'), 'Must export TooltipTrigger');
  assert.ok(content.includes('export function TooltipContent'), 'Must export TooltipContent');
  assert.ok(content.includes('export function TooltipProvider'), 'Must export TooltipProvider');

  // Verify portal prop support for map canvas boundary protection
  assert.ok(content.includes('portal?: boolean'), 'TooltipContent must accept portal prop');
  assert.ok(content.includes('portal === false'), 'TooltipContent must support non-portal rendering when portal=false');

  // Verify dark tactical styling
  assert.ok(content.includes('bg-[#0c1017]'), 'TooltipContent must use bg-[#0c1017]');
  assert.ok(content.includes('border-white/10'), 'TooltipContent must use border-white/10');
  assert.ok(content.includes('tabular-nums'), 'TooltipContent must use tabular-nums');
});

// ---------------------------------------------------------------------------
// SUITE 7: Chart Primitive Contract
// ---------------------------------------------------------------------------
runTest('Suite 7: Chart primitive contract & recharts integration', () => {
  const filePath = path.join(baseUiDir, 'chart.tsx');
  assert.ok(fs.existsSync(filePath), 'chart.tsx must exist in frontend/components/base-ui/');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('export function ChartContainer'), 'chart.tsx must export ChartContainer');
  assert.ok(content.includes('export function ChartTooltip'), 'chart.tsx must export ChartTooltip');
  assert.ok(content.includes('export function ChartTooltipContent'), 'chart.tsx must export ChartTooltipContent');

  assert.ok(content.includes('ResponsiveContainer'), 'Must wrap ResponsiveContainer from recharts');
  assert.ok(content.includes('bg-[#0c1017]'), 'ChartTooltipContent must use dark surface bg-[#0c1017]');
  assert.ok(content.includes('border-white/10'), 'ChartTooltipContent must use border-white/10');
  assert.ok(content.includes('tabular-nums'), 'ChartTooltipContent must enforce tabular-nums');
});

// ---------------------------------------------------------------------------
// SUITE 8: Consumer Integration in AnalyticsSection.tsx
// ---------------------------------------------------------------------------
runTest('Suite 8: Consumer integration in AnalyticsSection.tsx', () => {
  assert.ok(fs.existsSync(analyticsSectionFile), 'AnalyticsSection.tsx must exist');
  const content = fs.readFileSync(analyticsSectionFile, 'utf-8');

  // Check imports from base-ui
  assert.ok(content.includes("from '@/components/base-ui/card'"), 'Must import Card from @/components/base-ui/card');
  assert.ok(content.includes("from '@/components/base-ui/chip'"), 'Must import Chip from @/components/base-ui/chip');
  assert.ok(content.includes("from '@/components/base-ui/select'"), 'Must import Select from @/components/base-ui/select');
  assert.ok(content.includes("from '@/components/base-ui/tooltip'"), 'Must import Tooltip from @/components/base-ui/tooltip');
  assert.ok(content.includes("from '@/components/base-ui/empty'"), 'Must import Empty from @/components/base-ui/empty');
  assert.ok(content.includes("from '@/components/base-ui/skeleton'"), 'Must import Skeleton from @/components/base-ui/skeleton');

  // Verify raw <select> elements were replaced
  const rawSelectMatches = content.match(/<select\b/g);
  assert.strictEqual(
    rawSelectMatches,
    null,
    'All raw HTML <select> elements in AnalyticsSection.tsx must be replaced with Base-UI Select'
  );

  // Verify Base-UI Select is actively used
  assert.ok(content.includes('<Select'), 'AnalyticsSection must render Base-UI Select');
  assert.ok(content.includes('<SelectTrigger'), 'AnalyticsSection must render SelectTrigger');
  assert.ok(content.includes('<SelectValue'), 'AnalyticsSection must render SelectValue');
  assert.ok(content.includes('<SelectContent'), 'AnalyticsSection must render SelectContent');
  assert.ok(content.includes('<SelectItem'), 'AnalyticsSection must render SelectItem');

  // Verify Chip is actively used
  assert.ok(content.includes('<Chip'), 'AnalyticsSection must render Chip components');

  // Verify Card is actively used as container
  assert.ok(content.includes('<Card'), 'AnalyticsSection must render Card containers');

  // Verify Tooltip is actively used
  assert.ok(content.includes('<Tooltip'), 'AnalyticsSection must render Tooltip components');

  // Verify Empty and Skeleton are actively used
  assert.ok(content.includes('<Empty'), 'AnalyticsSection must render Empty component');
  assert.ok(content.includes('<Skeleton'), 'AnalyticsSection must render Skeleton component');

  // Verify local definitions were removed
  assert.ok(!content.includes('function AnalyticsEmpty('), 'Local AnalyticsEmpty function definition must be removed');
  assert.ok(!content.includes('function LoadingSkeleton('), 'Local LoadingSkeleton function definition must be removed');

  // Verify Invariant: No portal over Mapbox canvas (strict assertion, no tampering)
  assert.ok(
    content.includes('portal={false}'),
    'Must ensure tooltips and select content inside AnalyticsSection pass portal={false} to respect no-portal-over-mapbox rule'
  );
  assert.ok(
    !content.includes('portal={true}'),
    'Must not mount portals over map canvas inside AnalyticsSection'
  );
  assert.ok(
    content.includes('<TooltipContent side="top" portal={false}>'),
    'TooltipContent in AnalyticsSection must explicitly pass portal={false}'
  );
  assert.ok(
    !content.includes('title='),
    'All static native title attributes in AnalyticsSection.tsx must be replaced with Base-UI Tooltip'
  );

  // Verify Phase 119 Layout: Map-less dashboard layout (no Mapbox canvas)
  assert.ok(!content.includes('mapContainerRef'), 'Mapbox canvas ref must be removed for map-less layout');
  assert.ok(!content.includes('mapboxgl'), 'Mapbox GL JS must not be imported in map-less layout');
  assert.ok(content.includes('col-span-12'), 'AnalyticsSection must use grid layout');

  // Verify Phase 119 Zhav1 functional improvements
  assert.ok(content.includes('regionToDb'), 'Must implement regionToDb mapping');
  assert.ok(content.includes('formatDayMonth'), 'Must implement formatDayMonth calendar date formatting');
  assert.ok(content.includes('formatFullDate'), 'Must implement formatFullDate calendar date formatting');
  assert.ok(content.includes('Lihat Laporan'), 'Must retain Lihat Laporan button with shimmer');

  // Verify Anti-Slop typography invariant: zero micro-text text-[11px]
  assert.ok(
    !content.includes('text-[11px]'),
    'AnalyticsSection must not use micro-text text-[11px], minimum text-xs required'
  );
});

console.log(`\n================================================================`);
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY (100% GREEN)`);
console.log(`================================================================`);
