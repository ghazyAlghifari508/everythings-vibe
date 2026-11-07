# design-layout-consistency.md (Consolidated)

> **Status:** Consolidated into **`skill://vibe-ui-craft`** and **`AGENTS.md`**.
>
> All page family layout contracts, container strategies, breadcrumb rules, and typography standards live in the global skill `vibe-ui-craft`.

To read the authoritative rules, run:
```markdown
skill://vibe-ui-craft
```

### Quick Invariants:
- **5 Page Families:** Public Info (max-w-3xl/6xl), Settings (sidebar fixed 64), Workspace (h-dvh locked body), Admin (sticky header 14), Shared UI Primitives.
- **Breadcrumbs:** Bantuan, FAQ, and Settings DO NOT use breadcrumbs. Scrape uses `HubBreadcrumb`.
- **Typography:** Canonical light-weight typography matching Pricing (`<PageHeading>`).
- **Responsive:** 360px to 1280px zero horizontal overflow, touch target $\ge$ 44px.
