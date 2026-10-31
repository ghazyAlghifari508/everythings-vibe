# Component selection audit — VibeDesign Scrape repair

Working note required by the task contract. Records, per UI area, which components were
inspected (local first, then external), which were chosen, and why. Evidence for every
rejection is a resolution or source check run in this repository, not an assumption.

## 1. Local component inventory (audited first)

`src/components/ui/`: `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`,
`input.tsx`, `forbidden-page.tsx`, `logo.tsx`, `pricing-card.tsx`, `prompt-bar.tsx`,
`theme-sync.tsx`, `theme-toggle.tsx`, `thought-line.tsx`, `toast.tsx`, `top-up-card.tsx`.

Reusable disclosure patterns already in the repository: `components/bantuan/faq-accordion.tsx`
(controlled `aria-expanded` + rotating `ChevronDown`), `components/faq/faq.tsx`,
`components/prd/version-history.tsx`, `components/codebase/codebase-explorer-sidebar.tsx`,
`components/task/task-detail.tsx` (native `<details>` on mobile only).

## 2. External library availability (verified, not assumed)

| Package | Root resolution | Verdict |
|---|---|---|
| `framer-motion` 12.42.2 | resolvable | usable |
| `lucide-react` 1.27.0 | resolvable | usable |
| `@radix-ui/react-dialog`, `-dropdown-menu`, `-slot` | resolvable | usable |
| `@heroui/react` 3.2.6 | subpath import resolves via nested store | **not usable as-is** |
| `@heroui/styles` | **fails** from project root (`ERR_MODULE_NOT_FOUND`) | blocks HeroUI |
| `react-aria-components` | **fails** from project root | blocks HeroUI |
| `motion`, `motion/react` (ReactBits' import) | **not installed** | blocks raw ReactBits drop-in |
| `@hugeicons/react`, `@hugeicons/core-free-icons` (ReactBits' icons) | **not installed** | blocks raw ReactBits drop-in |
| `@radix-ui/react-collapsible`, `-accordion`, `-progress`, `-switch`, `-slider`, `-label` | **not installed** | unavailable |
| `tw-animate-css` (HeroUI stylesheet dependency) | **not installed** | blocks HeroUI stylesheet |

`@heroui/react/disclosure` imports `disclosureVariants` from `@heroui/styles` and renders
`react-aria-components` primitives. `@heroui/styles` cannot be imported from the project
root, so the class definitions behind `disclosureVariants()` (`disclosure`,
`disclosure__trigger`, `disclosure__content`) never reach the bundle. The component would
render with **no styles at all**. Its stylesheet also ships a global
`*, ::after, ::before, ::backdrop, ::file-selector-button { border-color: var(--border, currentColor) }`
reset plus a `:root` theme block, which would override this project's own token layer.
`skills-mcp.md` forbids installing a dependency that is not already present without
proposal and approval, so HeroUI is rejected on compatibility grounds — not to save effort.

## 3. Selected components per UI area

| UI area | Inspected | Selected | Reason |
|---|---|---|---|
| Scrape activity line (left panel) | local `thought-line.tsx`; ReactBits `ThoughtLine` source (`DavidHDev/react-bits`, `Micro/ThoughtLine`) | **repo `ThoughtLine`, restored to ReactBits fidelity** | The repo component is the ReactBits integration. ReactBits imports `motion/react` + `@hugeicons/*`, which are not installed; swapping the import surface would add two dependencies for zero behavior change. Fidelity is restored instead: `breathPeriod`, `breathDepth`, `settleDuration`, `settleBlur`, `shimmer`, `shimmerDuration`, `glyph="sparkle"`, `label`↔`doneLabel` cross-fade with blur, glyph breath loop, timer glide, mm:ss timer format, `collapsible`, `collapseOnSettle`, `showTimer`, `onSettle`. |
| Scrape stage progress bar | `@heroui/react/progress-bar`; local markup | **custom structural fix** | HeroUI `ProgressBar` is blocked (above). More importantly the bar is not a single-value progress bar: it is a **per-stage segmentation** driven by persisted `scrapes.status`. No registry component models N discrete stages with an indeterminate active segment. Fix is a 1-line dimension defect, not a missing component. |
| Stage status indicator | local `StageMarker` | **keep local, de-spinner** | Only needs a check (done) and one non-animated marker (active). The task forbids adding a replacement spinner. |
| Advanced Parameters disclosure | HeroUI `Disclosure`; `@radix-ui/react-collapsible`; local `faq-accordion.tsx` | **local controlled disclosure, following the existing `faq-accordion` pattern** | HeroUI blocked; Radix Collapsible not installed. The repository already ships a controlled `aria-expanded` disclosure with a rotating chevron and focus ring, which is the established in-repo pattern. Reusing that pattern is the correct choice over a new dependency. |
| Advanced Parameters numeric/toggle controls | local `ui/input.tsx`; HeroUI `NumberField`/`Switch` | **local `ui/input.tsx` + native checkbox** | HeroUI blocked. `ui/input.tsx` is the project's own base primitive and already carries the focus/disabled contract. |
| Color palette swatches | local `PaletteColorCard` | **keep local** | No registry equivalent is reachable; the swatch is a themed value tile with copy-to-clipboard, already implemented. |
| Type scale gallery / typeface inspector | local `TypePreview`, `FontCard` | **keep local, restructure data** | Defect is the data model (raw per-element rows), not a missing component. |
| Spacing / radius / elevation | local `SpacingRow` | **keep local, restructure data** | Same reason. |

## 4. Areas where a custom implementation is required

1. **Segmented stage bar.** No audited library models per-stage indeterminate progress driven
   by persisted server status. Building on the existing markup is the smallest correct change.
2. **Advanced Parameters disclosure.** HeroUI is not installable and Radix Collapsible is not
   present. The in-repo controlled disclosure pattern is reused rather than invented.
3. **Inspector sections.** They are project-specific renderers over the validated design model.

## 5. Live activity feedback (VibeScrape activity line)

Re-evaluated for the activity-line animation task, against the same local-first order.

| Candidate | Verdict |
|---|---|
| repo `src/components/ui/thought-line.tsx` (ReactBits ThoughtLine port) | **selected** — already ships the shimmer sweep, label cross-fade, reduced-motion handling and a single polite live region |
| repo `src/components/ui/agent-thinking.tsx`, `src/components/ui/orb.tsx` | rejected — they model AI reasoning traces / thinking orbs, which would invent a pipeline stage the scrape worker never reports |
| HeroUI `Spinner` / `ProgressCircle` | rejected — `@heroui/styles` still does not resolve from the project root (section 2), so the component ships unstyled |
| Magic UI `AnimatedShinyText` / `Spinner`, ReactBits `ShinyText`, shadcn `Skeleton` | rejected — not present in the repository and each would add a dependency for a single existing behaviour; no installation without a real need |

Implementation notes that shaped the choice:

- `ThoughtLine` is used in `bare` + `wrap` mode with `showTimer={false}`; the persisted clock stays
  with the existing `ElapsedTimer`, so the timer keeps its place at the right edge of the row and the
  activity column keeps its previous flex layout.
- The circular accent is the same `Loading02Icon` the stage ladder already uses, so the line reads as
  one design language instead of a second loading style. `breathDepth={0}` removes the glyph breathing
  loop, leaving exactly one spinner and one shimmer per area.
- The clock is anchored to the persisted stage (`stageStartedAt`, falling back to a stage-keyed
  `activityStartedAt` anchor) so an activity write cannot restart it while the stage is unchanged.
- Reduced motion is honoured twice: a synchronous `prefers-reduced-motion` read disables the shimmer
  and the fade, and `globals.css` neutralises the shimmer for the server-rendered frame.
