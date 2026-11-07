# no-assumptions.md (Consolidated)

> **Status:** Consolidated into **`skill://vibe-deep-engineering`** and **`AGENTS.md`**.
>
> All epistemic verification, anti-hallucination protocols, and monorepo workspace rules live in the global skill `vibe-deep-engineering`.

To read the authoritative rules, run:
```markdown
skill://vibe-deep-engineering
```

### Quick Invariants:
- Never answer from memory or training data; verify with tools first (`grep`, `read`, `glob`).
- **Rule 5A (Absence Claims Protocol):** Never claim *"X does not exist / CLI tidak ada"* after 1–2 searches. Map workspace roots (`packages/cli`), glob each root, grep repo-wide, and state coverage phrasing (*"Not found in [paths]"*).
- Read files before editing. Verify imports and actual types.
- Explain in Bahasa Indonesia; technical terms, identifiers, and commit messages stay in English.
