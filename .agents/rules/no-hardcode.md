# No-Hardcode Implementation Rules

## Core Principle

**NEVER hardcode values that should be configurable.** Every value that might change — API endpoints, service names, thresholds, limits, credentials, feature flags — must live in environment variables, config files, or constants modules. Hardcoded values create invisible coupling between documentation and code.

**NEVER choose a hardcoded or fake shortcut because it is faster.** "The real signal is harder to wire" is not an excuse — it is the job. If the honest implementation takes longer, take longer.

---

## Rule 1: No Inline Magic Values

When implementing ANY feature, NEVER copy-paste literal values from PRD, AC, tasks, or user instructions directly into source code.

| Bad | Good |
|---|---|
| `fetch("https://api.example.com/v2/invoices")` | `fetch(getPaymentApiUrl())` |
| `if (attemptsLeft < 3)` | `if (attemptsLeft < MAX_OTP_ATTEMPTS)` |
| `setInterval(fn, 300000)` | `setInterval(fn, CRON_INTERVAL_MS)` |
| `"Asia/Jakarta"` hardcoded in 5 files | `VENUE_TIMEZONE` in `constants.ts` |

**Exception:** Test files may use inline values for assertions.

---

## Rule 2: Wrappers Over Direct Integration

When integrating with ANY external service (payment gateway, email, SMS, storage), ALWAYS create a wrapper module. NEVER call the external API/library directly from business logic.

Pattern:
```
// lib/payments.ts — wrapper
export async function createPayment(params) { ... }
export async function getPaymentStatus(id) { ... }

// booking.service.ts — business logic calls wrapper
const payment = await createPayment({ amount, ... });
```

**Why:** Swapping providers means editing 1 file, not grep-replacing 15.

---

## Rule 3: Environment Variables for Secrets and URLs

These MUST come from env vars, never hardcoded:

- API keys, secrets, tokens
- Database URLs
- External service URLs
- Webhook secrets/tokens
- Feature flags

Pattern: `.env.example` documents what's needed. Runtime reads via `process.env` or config helper.

---

## Rule 4: Constants Module for Business Rules

Business rules from PRD/AC (limits, thresholds, timeframes) go in a constants file, not scattered across files.

Pattern:
```typescript
// lib/constants.ts
export const MAX_BOOKING_HOURS_PER_DAY = 4;
export const HOLD_DURATION_MS = 10 * 60 * 1000;
export const MAX_DAILY_SEARCH_RANGE = 14;
```

**Why:** When PRD changes a limit, you change 1 line. Not 8 scattered magic numbers.

---

## Rule 5: Verify Before Implementing

Before writing ANY value into code:

1. Check if it's already in a config/constants file — use that
2. If it's a secret/URL — use env var
3. If it's a business rule — add to constants file
4. If it's a default that might change — make it configurable
5. Only if it's truly a static, never-changing implementation detail — inline is OK

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Behavior |
|---|---|---|
| Copying PRD string into code | Invisible coupling — PRD changes, code doesn't | Use config/constant |
| `if (status === "paid")` in 10 files | String literal scattered everywhere | Enum or constant |
| API URL inline in route handler | Can't switch environments | Env var |
| "This will never change" | Everything changes. Trust no one. | Make it configurable anyway |
| Hardcoding credentials for "testing" | Leaks to production via copy-paste | `.env.test` |

---

## Rule 6: Never Embed User's Problem/Symptom Into Code

When the user reports a bug, error, or symptom, NEVER copy their literal problem text, exact error message, domain-specific example, or reproduction string into the codebase as a check, regex, denylist, test fixture, or comment.

| Bad | Good |
|---|---|
| regex matching the exact bug text the user reported | generic guard at the right boundary that normalizes/validates output shape, with no literal user content |
| test fixture containing the user's exact error phrase | synthetic placeholder ("`<sample content>`") or structural fixture |
| denylist of reported symptom values | validation of the contract (format, shape, structure) independent of any specific value |
| magic-string list that only matches what the user happened to report | behavior fixes at root cause that handle the whole class of problem |

**Why:** A guard keyed to the user's specific observed text only fixes THAT one occurrence; a different model, wording, or provider reproduces the same bug brand-new. It also leaks user conversation content into the repo. Also, bug fixes must target the root cause (why the AI output violated the contract), not the specific symptom value — otherwise every new manifestation needs a new hardcoded string.

**How to apply:** When a repair is needed, fix the mechanism that let invalid output through (validation, extraction, parsing, contract enforcement). Use generic structural rules. Test with neutral placeholders, never with the user's literal problem text.

---

## Rule 7: Never Fake Behavior — Indicators Must Be Wired to Real Signals

When implementing ANY status, progress, loading, or "AI is working" indicator, the indicator MUST be driven by real system signals — actual events, actual streamed data, actual measured state. **NEVER fabricate the appearance of activity.**

**The trap:** a fake indicator is EASIER to build than a real one. That ease is exactly why it is forbidden. If you catch yourself reaching for a hardcoded phrase list, fake progress bar, or simulated step sequence because "wiring the real signal is more work" — STOP. The real signal is the task.

Real incident (2026-08-24): an AI kept a rotating fake-status list and even EXTENDED it with more invented phrases instead of questioning whether it reflected anything real. The user had to force the honest rewrite. If existing code already contains a fake indicator, flag it — do not preserve or grow it.

| Forbidden | Why It's Wrong | Required Instead |
|---|---|---|
| Array of invented step/phase strings rotating on a timer (`"<step 1>"`, `"<step 2>"`, ...) not connected to actual pipeline stages | Implies observable work stages that do not exist; user sees through it as fake | Display the REAL signal (actual event/data stream), or ONE neutral static label |
| Fake progress % or fake progress bar not derived from measurement | Lies about completion state | Indeterminate spinner, or elapsed-time counter (measured, real) |
| Simulated typing/animation implying tokens when none have arrived | Masks the real connection/model state | Honest idle label until a real event arrives |

**Decision procedure (mandatory before writing any indicator):**

1. Enumerate the REAL signals available (event types, state transitions, measurable values).
2. If a real signal can drive the indicator → wire it, however inconvenient.
3. If NO real signal exists for a phase → show ONE honest neutral static label. Optionally add elapsed time. **Never invent a sequence.**
4. A single honest static label is acceptable; a fabricated dynamic one is not.

**Why:** Fake indicators are user-visible lies that erode trust in the product and in the AI that wrote them. They also rot: real signals change (new event types, new providers, new models), fake lists never keep up. The codebase must never contain UI whose only function is to *look* like the system is doing something it is not doing.

---

## Summary

1. **No magic numbers** — use constants
2. **No direct API calls** — use wrappers
3. **No hardcoded secrets/URLs** — use env vars
4. **No scattered business rules** — use constants module
5. **Verify before writing** — check existing config first
6. **Never embed user's problem/symptom into code** — fix root cause generically, test with neutral placeholders
7. **Never fake behavior** — indicators wired to real signals only; one honest static label beats a rotating lie; never pick a fake shortcut because it is faster
