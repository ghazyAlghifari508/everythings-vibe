# VibeDesign Studio — P3 Component Discovery Record

Scope: UI areas touched by `docs/prompt-design-studio/p3.md`. Produced before implementation
per `.opencode/rules/skills-mcp.md` §2 and p3.md §3 ("Mandatory Component-First UI Development").

This record extends `docs/studio-pr1-component-discovery.md`; it does not replace it. The
P1 record already settled the destructive-confirm dialog, the project menu, the full-surface
shimmer technique and the Cursor/Hand toolbar. P3 re-audited the areas it changes.

## 1. Repository baseline (Step A — search existing components first)

Verified by reading the actual files.

| Existing asset | Path | Capability used by P3 |
|---|---|---|
| Radix DropdownMenu wrapper | `src/components/ui/dropdown-menu.tsx` | Header project/export/profile menus; `Content` is portaled (`:54`), so menus are never clipped by the transformed canvas |
| Radix Dialog wrapper | `src/components/ui/dialog.tsx` | Delete confirmation and Add-screen dialog; portaled (`:30`) |
| Button (CVA) | `src/components/ui/button.tsx` | Dialog actions, `destructive` variant |
| Toast | `src/components/ui/toast.tsx` + `useUIStore.showToast` | Delete/add-screen confirmations |
| `ZoomControls` | `src/components/task/zoom-controls.tsx` | Bottom-corner zoom row, now with a caller-supplied reset label |
| `useCanvasZoom` | `src/hooks/use-canvas-zoom.ts` | Single clamp boundary for every zoom entry point, RAF coalescing, pointer-anchored zoom |
| `getCanvasDotStyle` | `src/components/task/whiteboard-canvas.tsx` | Dotted canvas surface shared by Studio |
| `StudioFrameShimmer` | `src/components/design/studio-frame-shimmer.tsx` | The one full-surface pending shimmer; reused unchanged |
| `shouldSubmitComposerEvent` | `src/components/design/composer-keyboard.ts` | Enter / Shift+Enter / IME contract, shared with the landing composer |
| `StudioSkillSelect` | `src/components/design/studio-skill-select.tsx` | Skill control reused by the canvas composer and the landing composer |
| `STUDIO_*` constants | `src/lib/constants.ts` | Canonical capture width, viewport height, scale factor, zoom bounds, overlay geometry |

## 2. Third-party libraries evaluated (Step B/C)

| Area | Candidates evaluated | Verdict |
|---|---|---|
| Floating canvas header | (a) repo `header` + repo `DropdownMenu`; (b) shadcn/ui `NavigationMenu`; (c) HeroUI `Navbar` | **Chosen: repo header + repo menus.** The requirement is a transparent overlay band with per-control surfaces, not a navigation component. `NavigationMenu` is not installed, and HeroUI's runtime imports `@heroui/styles`, which is **not resolvable from the project root** (verified in P1) with zero HeroUI usage anywhere in `src/`. |
| Frame status affordance | (a) repo `StudioFrameShimmer` + `lucide-react` `Loader2`/`AlertCircle`; (b) shadcn/ui `Badge`; (c) shadcn/ui `Skeleton` | **Chosen: repo shimmer + Lucide icons.** p3.md §5 explicitly rejects badges ("Do not use a large pill saying Menggenerate") and §6 rejects skeletons inside the artboard. The spinner is `motion-safe:animate-spin`, so reduced-motion users get a static icon. |
| Composer text input | (a) repo `studio-composer.tsx` textarea; (b) repo `src/components/ui/prompt-bar.tsx` | **Chosen: keep the repo composer textarea.** `prompt-bar.tsx` is a generic prompt surface with its own send appearance, and it is used by the codebase chat workspace; swapping it in would change the composer's visual contract (skill/design chips, selected-frame context) without being asked. The keyboard contract is already shared through `shouldSubmitComposerEvent`, which is what p3.md §14 actually requires. |
| Overlay collision geometry | (a) magic numbers inline in each component; (b) one shared geometry module | **Chosen: `src/components/design/studio-canvas-layout.ts`.** The composer and the zoom row must agree on one clearance rule; duplicating the arithmetic is exactly what let them overlap. |

## 3. New dependencies required

**None.** Every change uses dependencies already present in `package.json`
(`lucide-react`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-slot`,
`playwright`, `zod`). No package install, so no approval gate is triggered (`skills-mcp.md` §5).

Thinking Orbs and unrelated animation libraries were inspected only to confirm they are not
needed; nothing from them was added, because the requirement is a restrained workspace UI.

## 4. Genuinely custom behaviour (with reason)

| Behaviour | Why no ready-made component fits |
|---|---|
| `computeCanvasFit` (`studio-canvas.tsx`) | Fit-to-content must reserve this canvas's own floating header, composer band and toolbar column and clamp through the hook's canonical bounds. It is pure arithmetic over project-specific overlay constants; no registry component expresses it. |
| `resolveFrameArtboardMode` (`studio-frame.tsx`) | The state machine that guarantees "never shimmer forever" is derived from the project's own persisted frame status plus capture outcome. A generic loading component cannot express the terminal states. |
| Capture measurement clamp (`studio-visual.ts`) | Browser-screenshot geometry for a static full-page artboard; it is a Playwright contract, not a UI component. |
| `hasPositioningDeclaration` (`studio-design-system.ts`) | The mobile artboard's "no viewport-anchored bars" rule is a project contract enforced on generated HTML, evaluated per declaration rather than by rewriting stylesheets. |
