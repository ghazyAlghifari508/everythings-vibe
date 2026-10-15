# Bundled skill logo assets (p2)

Two design-skill logos are bundled locally under `public/icons/skills/` and referenced by
typed metadata in `src/lib/studio-design-skills.ts`. Both are genuine, official upstream
assets reused under permissive licenses. They are bundled (not hot-linked) so the Studio
UI never depends on a mutable external CDN.

| Skill | Bundled file | Upstream source | License | Attribution |
| --- | --- | --- | --- | --- |
| Impeccable | `public/icons/skills/impeccable.svg` | `https://github.com/pbakaus/impeccable` → `extension/icons/icon.svg` | Apache-2.0, Copyright 2025 Paul Bakaus | `docs/studio-skills/Apache-2.0.txt` |
| Taste | `public/icons/skills/taste.png` | `https://github.com/Leonxlnx/taste-skill` → `assets/taste-skill-logo.png` | MIT, Copyright (c) 2026 Leonxlnx | `docs/studio-skills/taste-LICENSE.txt` |

Skills without an official, licensable small logo (Frontend Design, UI UX Pro Max, Anti-Slop,
and the neutral No Skill entry) render a restrained lucide fallback icon instead. No invented
branding is presented as an official logo.

The full audit and per-repo evidence are recorded in
`docs/studio-p2-component-discovery.md` §5.
