# VibeDesign Studio — P2 Component & Asset Discovery Record

Scope: UI areas touched by `docs/prompt-design-studio/p2.md`. Produced before implementation per
`.opencode/rules/skills-mcp.md` §2 and p2.md "Mandatory component reuse and research".

This record extends `docs/studio-pr1-component-discovery.md` and `docs/studio-p3-component-discovery.md`; it does not replace them.

## 1. Repository baseline (Step A — search existing components)

Verified by reading the actual files, not filenames.

| Existing asset | Path | Evidence of capability |
|---|---|---|
| Radix Dialog wrapper | `src/components/ui/dialog.tsx` | Root/Trigger/Portal/Overlay/Content/Header/Footer/Title/Description/Close. `DialogContent` accepts `className` and already renders a top-right `DialogPrimitive.Close` (lucide `X` + `sr-only "Close"`). Radix provides focus trap, Escape-to-close and focus restoration. |
| Radix DropdownMenu wrapper | `src/components/ui/dropdown-menu.tsx` | Root/Trigger/Content/Item/Label/Separator/Group/Portal/Sub. `DropdownMenuContent` accepts `className` + `sideOffset`, is portaled and uses roving focus; `Item` supports `role`/`aria-checked`. |
| Button (CVA) | `src/components/ui/button.tsx` | `secondary` variant used by the picker footer. |
| Design picker dialog | `src/components/design/studio-design-picker-dialog.tsx` | hand-rolled `role="tablist"` / `role="tab"` / `role="tabpanel"` with three tabs (`tema`, `template`, `milik`); theme grid; custom DESIGN.md + logo staging. |
| Page-count selector | `src/components/design/studio-page-count-select.tsx` | 1–5 radio-style `DropdownMenu` menu reading `STUDIO_MIN/MAX/DEFAULT_PAGE_COUNT`. |
| Skill selector | `src/components/design/studio-skill-select.tsx` | single-select `DropdownMenu` over `STUDIO_DESIGN_SKILLS`, stable ids from `studioDesignSkillIdSchema`. |
| Landing composer | `src/components/design/studio-launch-composer.tsx` | reference trigger button (currently `Plus` when empty, `Palette` when active). |

Installed runtime packages relevant here: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`,
`@radix-ui/react-slot`, `lucide-react`, `tailwindcss@4`, `framer-motion`.

## 2. Third-party libraries evaluated (Step B/C)

Mandated sources: shadcn/ui, HeroUI, Magic UI, React Bits, Thinking Orbs.

| Area | Candidates evaluated | Verdict |
|---|---|---|
| Viewport-sized design picker | (a) shadcn/ui `Dialog` (registry) — same Radix primitive the repo wrapper already wraps; (b) HeroUI `Modal` — runtime imports `@heroui/styles`, **not resolvable from the project root** and zero HeroUI usage in `src/` (re-confirmed: `@heroui/react` has 0 runtime imports); (c) repo `dialog.tsx` | **Chosen: repo `dialog.tsx`.** It is the identical primitive shadcn ships, already carries the built-in close button, Escape, focus trap and focus restoration; only geometry overrides are needed. Adding HeroUI would introduce an unresolvable stylesheet and a first-use dependency. |
| Picker tab switcher | (a) shadcn/ui `Tabs` (Radix `@radix-ui/react-tabs`) — **not installed** (absent from `node_modules/@radix-ui` and `package.json`); (b) repo hand-rolled `role="tablist"` | **Chosen: keep the existing repo tablist.** It already implements the ARIA tab contract and is exercised by tests; installing `@radix-ui/react-tabs` requires a proposal + approval gate (`skills-mcp.md` §5) and would change keyboard semantics not called for by p2.md. |
| Inner scroll region | (a) shadcn/ui `ScrollArea` (Radix `@radix-ui/react-scroll-area`) — **not installed**; (b) native overflow container | **Chosen: native `overflow-y-auto`** inside the dialog body (already the pattern in the picker). No new dependency. |
| Page-count & skill selection lists | (a) shadcn/ui `Select`/`RadioGroup` — `@radix-ui/react-select` and `@radix-ui/react-radio-group` **not installed**; (b) repo `dropdown-menu.tsx` radio items | **Chosen: repo `dropdown-menu.tsx`** with `role="menuitemradio"` + `aria-checked` (already used and tested). Keyboard/roving-focus and styling stay consistent with the rest of Studio. |
| Reference trigger icon & tooltip | (a) shadcn/ui `Tooltip` (Radix `@radix-ui/react-tooltip`) — **not installed**; (b) `title` + `aria-label` (existing repo pattern, e.g. submit button, page-count trigger) | **Chosen: native `title` + `aria-label`**, matching the existing accessible-name pattern already used across the composer. No new dependency. |
| Decorative motion / orbs | Magic UI, React Bits, Thinking Orbs | **Rejected.** p2.md forbids decorative AI iconography and excessive ornament; the surfaces are utility controls. No candidate adds functional value, so none is integrated (this is the documented "discovery yielded no fitting candidate" case per `skills-mcp.md` §2.7). |

## 3. New dependencies required

**None.** Every change is implemented with dependencies already present in `package.json`.
No package install, so no approval gate is triggered (`skills-mcp.md` §5).
This also honours p2.md: "Do not install all libraries indiscriminately."

## 4. Genuinely custom behaviour (with reason)

- **Full-viewport dialog geometry** — a viewport-sized, inset, flex-column dialog with fixed
  header/footer and a single scrolling body. No registry component expresses "nearly whole
  viewport with intentional safe insets, header/footer pinned, content scrolls"; it is layout
  arithmetic over the existing Radix dialog. Implemented via `className` overrides only.
- **Typed skill asset metadata** — `studio-design-skills.ts` gains typed optional asset fields
  (p2.md §4 requirement). No component library applies to catalog metadata.

## 5. Skill logo asset audit (p2.md §4 — mandatory source verification)

Each official repository and its documented visual assets were inspected directly (GitHub
`contents` API listings, raw file fetches, raw LICENSE fetches).

| Skill | Upstream repo | Official asset(s) found | Asset type | License | Decision |
|---|---|---|---|---|---|
| Impeccable | `pbakaus/impeccable` | `extension/icons/icon.svg` (330 B), `icon-16/32/48/128.png` | purpose-built small icon set | Apache-2.0 © 2025 Paul Bakaus | **USE** `extension/icons/icon.svg` (bundled locally, attribution recorded) |
| Taste | `Leonxlnx/taste-skill` | `assets/taste-skill-logo.png` (17,279 B) and `assets/taste-skill-logo.webp` (3,280 B) | dedicated logo | MIT © 2026 Leonxlnx | **USE** `assets/taste-skill-logo.png` (bundled locally, attribution recorded) |
| Frontend Design | `anthropics/skills` (`skills/frontend-design`) | none — folder contains only `SKILL.md` + `LICENSE.txt` | none | Apache-2.0 (Anthropic) | **FALLBACK ICON** (no official image exists) |
| UI UX Pro Max | `nextlevelbuilder/ui-ux-pro-max-skill` | only `screenshots/` + `gallery/` app + `preview/*.html`; no `icon`/`logo` asset | README screenshot | MIT © 2024 Next Level Builder | **FALLBACK ICON** |
| Anti-Slop | `miqdadbadjuber/anti-slop` | `assets/antislop-banner.png` (≈180 KB wide banner) + `assets/profile.png` (author avatar) | banner, not a logo | MIT © 2026 Miqdad Badjuber | **FALLBACK ICON** (banner is not a suitable small mark) |
| No Skill | — | none | — | — | **FALLBACK ICON** (neutral "no guidance" mark) |

Reuse of the two real assets is legally appropriate (permissive MIT / Apache-2.0); both are
bundled locally (not hot-linked), which p2.md explicitly prefers over mutable external CDNs.

Unverified / limitations: no material gaps. Every asset above was observed in a live `contents`
listing with sha + size, and every license was read from the raw `LICENSE` file. Frontend Design,
UI UX Pro Max and Anti-Slop genuinely ship no small logo, so they receive restrained, semantically
distinct Lucide fallback icons rather than invented branding.
