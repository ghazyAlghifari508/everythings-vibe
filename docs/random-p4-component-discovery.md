# Random P4 — Badge & Status Component Discovery Record

Scope: global badge/status redesign (`docs/prompt-random/p4.md`). Records the
component-first exploration, the responsibility inventory, the domain mappings,
and the reason each ready-made component was or was not reused.

## 1. Repository baseline (inspected first)

| Existing asset | Path | Use in P4 |
| --- | --- | --- |
| `Badge` (CVA) | `src/components/ui/badge.tsx` | Reused as the neutral container for category/identity labels. Variants restyled to theme tokens; public `variant` API preserved. |
| `Icon` (Hugeicons wrapper) | `src/components/ui/icon.tsx` | Reused for every status glyph. Decorative by default, 12–14px in compact rows. |
| `getPaymentStatusInfo` | `src/features/billing/utils/payment-status.ts` | Payment domain mapping kept independent; returns semantic tone + icon instead of hand-written color classes. |
| `getStatusBadge`, `getStatusLabel` | `src/features/billing/utils/credit-usage-status.tsx` | Credit operation domain mapping kept independent; same semantic shape. |
| `Dialog` / `Alert` | `src/components/ui/dialog.tsx`, `src/components/ui/alert.tsx` | Confirmed as banners/dialogs, not badges. Left untouched. |
| `Spinner` | `src/components/ui/spinner.tsx` | Existing processing indicator; status icon system does not duplicate it. |

## 2. Third-party registries and libraries evaluated

| Candidate | Verdict |
| --- | --- |
| shadcn/ui `Badge` (already vendored in repo) | **Reused.** The repo already owns the shadcn CVA badge. Restyled its variants to neutral theme tokens instead of writing a second container primitive. |
| HeroUI `Chip` / `Badge` (`@heroui/react@3.2.6`, already installed) | **Not adopted.** The package is installed only for `Spinner`, `ScrollShadow`, `Tabs`, `ToggleButton`; no HeroUI stylesheet is imported in `src/app/globals.css` or `vite.config.ts`. Adopting `Chip` would require introducing a second theming system and a global CSS import, conflicting with the existing `data-theme`/`.dark` tokens. Its `color + variant + soft` combinations reproduce the same tinted-container pattern this task removes. |
| Magic UI / React Bits / TuffUI "Status Pill" / affectUI "Badge" | **Not adopted.** All four ship animated or pill-shaped status containers with soft colored backgrounds. They encode exactly the pattern being removed, and would add a dependency for a primitive already present. |
| Thinking Orbs (`@yogesharc/thinking-orbs`, already installed) | **Not adopted for badges.** Purpose is animated AI thinking states in the chat composer, not compact table status. Repo already owns `src/components/ui/orb.tsx` for that surface. No status label was replaced with an orb. |
| Primer `StateLabel`, Atlassian `Lozenge`, Linear status rows | **Principles reused, not cloned.** Icon + readable label; neutral treatment for ordinary lifecycle states; semantic color reserved for states that need attention; no colored border by default. |
| CUI / SakaniUI | No compatible badge/status primitive found that improves on the vendored shadcn primitive without a new dependency. |

**New dependencies:** none.

## 3. Responsibility inventory

| Responsibility | Presentation | Examples | Shared primitive |
| --- | --- | --- | --- |
| **Status** (operational state) | Icon + neutral readable text, semantic color on icon only | Berhasil, Menunggu, Diproses, Gagal, Dilepas, Dikarantina | `StatusIndicator` |
| **Status, emphasized** (genuine attention) | Neutral container + semantic icon/text, no colored border | Banned, account restriction, critical payment issue | `StatusBadge` |
| **Category / identity** | Neutral subtle container, no border, no uppercase unless abbreviation | Pro, Hengker, PRD, AC, Task, Top-up, Exempt, Paling Laris | `Badge` |
| **Counter** | Compact numeric chip, distinct from status semantics | Project count, failure count | `NumericBadge` |

Non-badge surfaces deliberately excluded: inline error banners, alert cards,
selected-state buttons, and code/diff markup. They are containers or controls,
not status labels, and are covered by their own component contracts.

## 4. Domain semantics (kept independent)

| Domain | States | Source mapping |
| --- | --- | --- |
| Payment | success/settlement/capture, pending, cancel, expire, refund, partial_refund, chargeback, failed/deny | `getPaymentStatusInfo` |
| Credit operation | settled, released, failed, reserved, running, settling, quarantined, refunded, quoted | `getStatusBadge` / `getStatusLabel` |
| Background job | diproses, menunggu, gagal (shown via credit operation states) | `StatusIndicator` + credit mapping |
| Ticket lifecycle | new, in_progress, resolved, archived | `admin-feedback-row` |
| Project lifecycle | draft/ide, questions, prd, ac, task, deleted | `admin-project-row`, `admin-dashboard-view` |
| Account status | active, banned, admin, exempt | `admin-user-row` |

Backend enums are unchanged. `Pro` and `Hengker` remain plan identities, not
success states. Payment pending is never merged into payment failed. Credit
released is never rendered as a paid charge.

## 5. Custom implementation rationale

Only the four presentation primitives are app-owned: `Badge` (restyle of the
vendored shadcn component), `StatusIndicator`, `StatusBadge`, and `NumericBadge`.
No suitable external component combined (a) borderless icon+label presentation,
(b) existing Hugeicons set, and (c) current light/dark tokens without a new
dependency or a second theme system. That is the only reason any new primitive
exists.

## 6. Documented exceptions

These surfaces keep their own presentation because they are not passive
badge/status labels. None use random hex colors, gradients, or glowing borders.

| Surface | Why excluded | What still applies |
| --- | --- | --- |
| Inline error banners and alert cards (`Alert`, `src/components/ui/alert.tsx`) | Block-level messaging with instructions, not compact inline state | Existing alert contract; no `StatusIndicator` substitute |
| Selected-state controls and action buttons (radio cards, question options, composer reference chips, admin ban/unban buttons) | Interactive controls with remove buttons, keyboard focus rings, or explicit destructive/confirmation intent | Tinted containers changed to neutral `border-graphite bg-obsidian`; meaning carried by icon, text, and `data-stale` |
| Step-number circles and progress indicators | Sequence markers, not status labels | Existing step/progress components |
| Diff and revision markup, code/diff markers | Developer-authored content semantics, not product status | Existing code/diff markup |
| User-generated Studio output | Output belongs to the user, not app chrome | Not modified by design |
| Decorative icon containers, selection overlays, and layout colors | Canvas or modal chrome, not status labels | Existing canvas/layout contracts |
| Mono metadata such as image format (`JPG`, `PNG`) | Inline code-like metadata, not a status pill | Uses existing mono text treatment, no badge container |
| Third-party embedded UI | Own theme and stylesheet | Not modified |

Migrated developer-owned surfaces: Admin, Billing, Credit usage, Pricing,
Greenfield-adjacent codebase chat, Studio chrome, Scrape failure summary,
Templates, and the two top-up package pickers. Domain mappings remain separate
per table in section 4.
