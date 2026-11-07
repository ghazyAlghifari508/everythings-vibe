# no-hardcode.md (Consolidated)

> **Status:** Consolidated into **`skill://vibe-deep-engineering`** and **`AGENTS.md`**.
>
> All configuration, constants discipline, and real signal indicator rules live in the global skill `vibe-deep-engineering`.

To read the authoritative rules, run:
```markdown
skill://vibe-deep-engineering
```

### Quick Invariants:
- No inline magic values: use constants in `src/lib/constants.ts` or env vars.
- External service integrations (Midtrans, Resend) must use wrapper modules in `src/lib/`.
- Never embed user's problem text or reproduction symptom strings into code as checks/comments.
- **Indicators must be wired to REAL signals:** Never fabricate progress percentages, fake step sequences, or simulated typing. Use one honest static label if no stream exists.
