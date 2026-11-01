# VibeDesign Studio — Component Discovery Record

Scope: affected UI areas for the pr1.md revision. Produced before implementation per
`.opencode/rules/skills-mcp.md` §2 and pr1.md §2 ("Required component discovery evidence").

## 1. Repository baseline (Step A — search existing components)

Verified by reading the actual files, not filenames.

| Existing asset | Path | Evidence of capability |
|---|---|---|
| Radix DropdownMenu wrapper | `src/components/ui/dropdown-menu.tsx` | Root/Trigger/Content/Item/Label/Separator/Group/Portal; `data-[disabled]` styling; portal + animations |
| Radix Dialog wrapper | `src/components/ui/dialog.tsx` | Root/Trigger/Portal/Overlay/Content/Header/Footer/Title/Description/Close; focus + Escape handled by Radix |
| Button (CVA) | `src/components/ui/button.tsx` | `destructive` variant already defined |
| Toast | `src/components/ui/toast.tsx` + `useUIStore.showToast` | success/error/info, auto-dismiss 4s |
| ZoomControls | `src/components/task/zoom-controls.tsx` | Zoom out / % / zoom in / reset, already used by both canvases |
| useCanvasZoom | `src/hooks/use-canvas-zoom.ts` | single clamp callback + RAF coalescing |
| Canvas dot grid | `getCanvasDotStyle` in `src/components/task/whiteboard-canvas.tsx` | shared by Studio canvas |
| Focus trap hook | `src/hooks/use-focus-trap.ts` | exists for custom overlays |
| Studio sidebar / composer / frame / canvas | `src/components/design/*` | production implementations to be extended, not replaced |

Installed runtime packages relevant here: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`,
`@radix-ui/react-slot`, `@heroui/react@3.2.6`, `framer-motion`, `lucide-react`, `tailwindcss@4`.

## 2. Third-party libraries evaluated (Step B/C)

| Area | Candidates evaluated | Verdict |
|---|---|---|
| Destructive confirm dialog | (a) shadcn/ui `AlertDialog` (Radix `@radix-ui/react-alert-dialog`) — registry item inspected; (b) existing repo `dialog.tsx` Radix Dialog wrapper; (c) HeroUI 3.2.6 `AlertDialog` — `.d.ts` inspected in `node_modules/@heroui/react/dist/components/alert-dialog` | **Chosen: existing repo Radix Dialog wrapper + repo Button `destructive`.** `@radix-ui/react-alert-dialog` is **not installed** (verified: absent from `node_modules/@radix-ui` and `package.json`); installing a new package requires proposal + approval per `skills-mcp.md` §5, and the existing Radix Dialog wrapper already provides focus trap, Escape, focus restoration and portal behaviour. HeroUI `AlertDialog` is not usable here: its runtime imports `@heroui/styles`, which is **not resolvable from the project root** (`require.resolve('@heroui/styles')` → `MODULE_NOT_FOUND`; only the transitive `.pnpm` entry exists), and HeroUI components have zero usage anywhere in `src/`. |
| Contextual project menu | shadcn/ui `DropdownMenu` (registry) vs repo `dropdown-menu.tsx` | **Chosen: repo `dropdown-menu.tsx`.** It is the same Radix primitive the Studio header already uses, so keyboard/roving-focus and styling stay consistent. |
| Loading shimmer for a full artboard | (a) shadcn/ui `skeleton` — registry fetched: `animate-pulse rounded-md bg-accent` (an internal *skeleton* primitive, explicitly rejected by pr1.md §6); (b) Magic UI `shimmer-button` — registry fetched: conic-gradient perimeter spark, wrong geometry (button perimeter, not a full-surface sweep); (c) Magic UI `shine-border` — registry fetched: `radial-gradient(transparent,transparent,<color>,transparent,transparent)` with `background-size:300% 300%` + `animate-shine` moving `background-position`, masked to a border ring; (d) React Bits `ShinyText` — registry fetched: canvas/rAF text sheen, wrong target (text, not surface); (e) HeroUI `Skeleton` — `.d.ts`/`.js` inspected: needs `@heroui/styles` (unresolvable, see above); (f) `animate-pulse` Tailwind utility already present in the repo | **Chosen: adapt Magic UI `shine-border`'s proven technique** (large `background-size` + `background-position` keyframes, `will-change`, `motion-safe:` guard) into a full-surface sweep on the artboard container. This is the only evaluated candidate whose animation is a full-surface gradient sweep, which is exactly the required "one continuous shimmer across the whole artboard". The existing `.studio-generating-artboard` rule in `src/app/globals.css` is extended rather than replaced. |
| Right-centre Cursor/Hand toolbar | shadcn/ui `toggle-group`/`toolbar`, HeroUI `toolbar`/`toggle-button-group`, repo plain buttons | **Chosen: existing repo buttons** with `aria-pressed` + `title`/`aria-label` (the current markup already implements the correct semantics and keyboard contract). `@radix-ui/react-toolbar`, `react-toggle-group`, `react-tooltip` are **not installed**; the repo has no toggle-group/tooltip primitive. Reusing the existing buttons avoids a new dependency while keeping the a11y contract; only placement/geometry changes. |
| Composer simplification | repo `studio-composer.tsx` + repo `dropdown-menu.tsx` | **Chosen: repo primitives.** Project actions stay in the existing project-level `DropdownMenu` in `studio-header.tsx`. |

## 3. New dependencies required

**None.** Every change is implemented with dependencies already present in `package.json`.
No package install, so no approval gate is triggered (`skills-mcp.md` §5).

## 4. Genuinely custom behaviour (with reason)

- **Full-surface artboard shimmer keyframes** — no evaluated registry component targets
  "one gradient sweeping a whole artboard surface". Adapted from Magic UI `shine-border`'s
  technique instead of inventing an unrelated animation.
- **Zoom canonical clamp on the hook boundary** — `useCanvasZoom` is repo-owned and already
  the single shared boundary for both canvases; extending it is reuse, not reinvention.
- **Deletion service transaction** — domain-specific multi-table cleanup; no component library applies.
