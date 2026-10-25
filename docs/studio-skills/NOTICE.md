# Studio design skill adapters (version 3)

The selectable design skills in VibeDesign Studio are integrated from the pinned upstream definitions below. Verbatim copies of the upstream skill documents and relevant reference files are bundled locally under `src/features/studio/skills/<id>/`.

Upstream skill instructions refine visual hierarchy, typography, composition, and accessibility. However, **every adapter remains subordinate to Studio's safety, platform validity, user-specified brief, active design reference (`DESIGN.md`), and clean HTML output contracts**. No arbitrary remote scripts are executed and no remote network requests are made during frame generation.

---

## 1. Upstream Pinned Revisions & Attribution

| Skill ID | Upstream Repository | Pinned Revision (40-hex) | Bundled Files | Upstream Version & License |
| :--- | :--- | :--- | :--- | :--- |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `245ad82def45831dc56a21b683c7a1ff530b06cc` | `SKILL.md`, `craft-floor.md`, `operate.md` | v4.5.2, Apache-2.0 (`Apache-2.0.txt`), Copyright 2025 Paul Bakaus |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | `SKILL.md` | Apache-2.0 (`Apache-2.0.txt`), Copyright Anthropic |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `7246805992a42b7bba37d4cac83b01416f0c6c44` | `SKILL.md`, `quick-reference.md`, `pro-rules.md`, 9 curated CSVs | MIT (`ui-ux-pro-max-LICENSE.txt`), Copyright (c) 2024 Next Level Builder |
| `anti-slop` | [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop) | `9685ca7eac70283d083fc23baa9a88e7d3cd93c4` | `SKILL.md`, `antislop-ui.md`, `antislop-layoutmobile.md`, `antislop-human.md` | MIT (`anti-slop-LICENSE.txt`), Copyright (c) 2026 Miqdad Badjuber |
| `taste` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | `d237dd399d57524945c0c81327da5da19f7a468d` | `SKILL.md` | MIT (`taste-LICENSE.txt`), Copyright (c) 2026 Leonxlnx |

---

## 2. Upstream Capability Matrix

Capabilities are classified into four strict categories:
- **A — Native and compatible:** Directly and faithfully integrated into Studio's LLM prompt/generation pipeline.
- **B — Compatible with an additional tool/service:** Requires a safe server-side tool, bounded dataset lookup, or custom parser (e.g. UI UX Pro Max dataset lookup at planning time).
- **C — Not supported by current runtime:** Requires runtime capabilities Studio does not possess (e.g. running arbitrary Python/Node scripts, headless screenshot vision feedback loops, AI image diffusion models).
- **D — Inapplicable to requested surface:** Upstream concepts designed for a different paradigm (e.g. interactive terminal CLI loops on existing git repositories, or marketing-only landing page quotas applied to multi-screen SaaS dashboards).

| Skill | Guidance (Core SKILL.md) | References & Rules | Dataset / Search Tool | Runtime Workflow & Automation |
| :--- | :---: | :---: | :---: | :---: |
| **Impeccable** | **A** (Full verbatim text) | **A** (`craft-floor.md`, `operate.md`) | **C** (No interactive CLI/script execution) | **D** (Git CLI audit loop inapplicable to web prototype generation) |
| **Frontend Design** | **A** (Full verbatim text) | **A** (Self-contained in SKILL.md) | **A** (No external dataset needed) | **C** (Screenshot vision self-critique loop not run during frame generation) |
| **UI UX Pro Max** | **A** (Full verbatim text) | **A** (`quick-reference.md`, `pro-rules.md`) | **B** (Bounded TypeScript dataset lookup for style, color, font, UX, tailwind) | **D** (Interactive CLI `search.py` replaced by planning-phase bounded lookup) |
| **Anti-Slop** | **A** (Full verbatim text) | **A** (`antislop-ui.md`, `layoutmobile.md`, `human.md`) | **A** (Contrast & touch target rules) | **C** / **D** (Delivery Gate interactive click-through not supported during automated worker) |
| **Taste** | **A** (Verbatim text with scope adapter) | **A** (Self-contained in SKILL.md) | **C** (Flux/Midjourney image generation not supported) | **D** (Upstream landing-page-only restriction scoped; transferable composition used) |

---

## 3. Detailed Skill Integration Analysis

### 3.1. Impeccable (v4.5.2)
- **Upstream Scope:** Stances (`persuade`, `operate`, `read`, `experience`), 12 command-driven design criteria, reference documents, and anti-patterns.
- **Integrated (A):** The full upstream `SKILL.md` along with reference files (`craft-floor.md` and `operate.md`) are bundled verbatim. Operational screen rules and craft floor quality checks are injected into the frame and planning prompts within the character budget.
- **Unsupported / Inapplicable (C, D):** Interactive CLI commands (`/impeccable:audit`, `/impeccable:critique`), local git detector hooks, and shell scripts. Studio is an automated HTML prototype generator and does not execute developer shell commands.

### 3.2. Frontend Design
- **Upstream Scope:** Content-grounded design, anti-default aesthetics, distinctive typography, intentional color palettes, and self-critique.
- **Integrated (A):** The entire upstream `SKILL.md` is bundled verbatim and loaded in full. It fits comfortably within the budget (~9.4 KB) and directly influences the visual character of the planned screens and generated HTML.
- **Unsupported (C):** Upstream instructions suggest capturing a screenshot and performing a visual self-critique loop before finalizing code. Studio performs rigorous DOM and HTML contract validation, but does not invoke multimodal vision models during frame worker execution.

### 3.3. UI UX Pro Max
- **Upstream Scope:** Priority order (Accessibility > Touch > Responsive > Typography > Feedback), extensive quick-reference guides, pro rules, and 12+ CSV data files searched via Python CLI (`search.py`).
- **Integrated (A, B):**
  - Upstream `SKILL.md`, `quick-reference.md`, and `pro-rules.md` are bundled verbatim and loaded into guidance.
  - Rather than omitting the design datasets, Studio implements a **bounded, deterministic TypeScript lookup** (`ui-ux-pro-max-lookup.ts`) that matches the user prompt and project mode against the bundled CSVs (`products.csv`, `styles.csv`, `colors.csv`, `typography.csv`, `ux-guidelines.csv`, `landing.csv`, `charts.csv`, and `stacks/html-tailwind.csv`).
  - At planning time, the matched recommendations (style, color palette, typography font pairing, and critical UX rules) are extracted and injected into the planning prompt and design blueprint.
- **Unsupported / Divergence (C, D):** Python script execution (`search.py`, `core.py`, `design_system.py`) is intentionally not run. The standalone Google Fonts catalog (747 KB) and upstream icon JSON (824 KB) are excluded from prompt injection to keep token usage strictly bounded.

### 3.4. Anti-Slop
- **Upstream Scope:** 38 anti-slop rules, purposeful design filter, anti-filler copy, layout mobile guidelines, human accessibility guidelines, and the Delivery Gate checklist.
- **Integrated (A):** Core `SKILL.md`, `antislop-ui.md`, `antislop-layoutmobile.md`, and `antislop-human.md` are bundled verbatim and loaded into prompt guidance within budget.
- **Unsupported (C, D):** The upstream "Delivery Gate" asks developers to click through the live running app in a browser to test focus rings and contrast. In Studio, contract validation runs server-side; browser QA is not performed during automated generation.

### 3.5. Taste
- **Upstream Scope:** 89 KB comprehensive agency design skill, brief inference engine, typography pairings, spatial harmony, and anti-template rules. Upstream explicitly states: *"Designed specifically for landing pages and marketing websites. DO NOT use for: complex dashboards, data-dense interfaces, web applications, multi-step flows, native mobile apps."*
- **Integrated (A):** Bundled verbatim. Studio's compatibility adapter explicitly instructs the LLM to apply the transferable aesthetic principles (typography scale, spatial rhythm, intentional color contrast, card grouping) to all screen types, while exempting dashboards and mobile app screens from landing-page-specific section quotas and complex hero animations.
- **Unsupported (C):** Image generation prompts for Flux/Midjourney mentioned in upstream. Studio generates clean HTML/Tailwind with SVG icons and curated Unsplash imagery.

---

## 4. Precedence Model

When generating or planning screens, instructions resolve in this strict order:

```
1. Safety & Platform Validity (clean valid HTML, Tailwind CDN, script rules)
             │
             ▼
2. Explicit User Prompt & Requirements
             │
             ▼
3. Selected Design Reference (DESIGN.md tokens, active color palette, brand font)
             │
             ▼
4. Selected Upstream Design Skill Guidance (Impeccable, Frontend Design, etc.)
             │
             ▼
5. Studio Baseline System Defaults
```

A selected skill never overrides an explicit user brand identity or violates the clean HTML contract.

---

## 5. Token & Context Budget

To prevent context exhaustion and latency spikes, Studio enforces a strict character budget for skill documents:
`STUDIO_SKILL_DOCUMENT_BUDGET_CHARS = 100_000` (matching the precedent set by `STUDIO_DESIGN_MD_MAX_CHARS`).

1. The primary upstream `SKILL.md` is always loaded first in its entirety.
2. Supporting reference documents (`quick-reference.md`, `craft-floor.md`, sub-skills) are appended in declared priority order up to the character budget.
3. Any truncated or omitted references are documented in the skill resolution metadata.

`No Skill` (`id: "none"`) injects zero additional guidance into the system prompt.
