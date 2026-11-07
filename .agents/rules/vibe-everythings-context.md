# vibe-everythings-context.md (Consolidated)

> **Status:** Consolidated into **`skill://vibe-domain-context`** and **`AGENTS.md`**.
>
> All multi-surface architecture (Greenfield, Codebase, Scrape, Studio, Admin), database schema tables, and Midtrans credit billing flows live in the global skill `vibe-domain-context`.

To read the authoritative domain reference, run:
```markdown
skill://vibe-domain-context
```

### Quick Invariants:
- **Surfaces:** Greenfield (Ask $\rightarrow$ Fitur $\rightarrow$ PRD $\rightarrow$ AC $\rightarrow$ Task $\rightarrow$ Kanban), Existing Codebase (CLI sync via `packages/cli`), VibeScrape (Playwright crawler $\rightarrow$ `DESIGN.md`), VibeDesign Studio (HTML/Tailwind preview).
- **Billing:** Midtrans Snap API, credit lifecycle (`quoted` $\rightarrow$ `reserved` $\rightarrow$ `settled`), atomic burn (`WHERE credits_used + :charge <= credits`). Revisions are always FREE.
- **Server-Only Dynamic Imports:** Dynamic import `@/db` in server actions/handlers. Never import `@/db` in client components.
- **Tenant Isolation:** App-level tenancy via `WHERE user_id = ?` on every query/mutation.
