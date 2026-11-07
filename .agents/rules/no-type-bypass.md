# no-type-bypass.md (Consolidated)

> **Status:** Consolidated into **`skill://vibe-deep-engineering`** and **`AGENTS.md`**.
>
> All strict type-safety invariants and Drizzle/Zod modeling contracts live in the global skill `vibe-deep-engineering` and `AGENTS.md` Core Invariant #2.

To read the authoritative rules, run:
```markdown
skill://vibe-deep-engineering
```

### Quick Invariants:
- **Strictly Forbidden:** `as never`, `as any`, `as unknown as any`, `@ts-ignore`, `@ts-expect-error`, broad `as unknown as Record<string, unknown>`, and `values({...} as never)`.
- Use Drizzle inference (`$inferInsert` / `$inferSelect`), `$type<T>()` for JSON schema columns, project-owned typed `AppError`, and Zod runtime parsing for unknown payloads.
- Casts on external SDK bugs require `// cast boundary: <reason>` and narrow single-level types.
