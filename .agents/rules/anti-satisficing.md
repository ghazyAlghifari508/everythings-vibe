# anti-satisficing.md (Consolidated)

> **Status:** Consolidated into **`skill://vibe-deep-engineering`** and **`AGENTS.md`**.
>
> All work-ethic, root-cause, anti-satisficing, and full-spectrum testing rules live in the global skill `vibe-deep-engineering`.

To read the authoritative rules, run:
```markdown
skill://vibe-deep-engineering
```

### Quick Invariants:
- `(Recommended)` means the most correct solution for product & architecture, NEVER the easiest or fewest tokens for the agent.
- Happy path is only 1 row; full state matrix required (Empty, Loading, Disabled, Valid, Invalid, Unauthorized, Failure, Cancel, Success).
- Root cause over symptom patches (no empty try/catch, no arbitrary timeouts).
- Prototypes are throwaway code; production deliverables require full types, Zod schemas, and tests.
