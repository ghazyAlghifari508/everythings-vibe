# Universal Credit Ledger (TASK 06)

Architectural foundation only. No Studio or Scrape charge is active.

## Resource identity

`credit_operations` keeps its existing columns and adds typed, validated resource references.

| Column | Meaning |
| :--- | :--- |
| `resource_type` | `plan_project`, `studio_project`, `scrape` |
| `project_id` | now nullable; set only for `plan_project` |
| `studio_project_id`, `studio_job_id` | Studio resource and billable job |
| `scrape_id` | the scrape row is both resource and job |
| `product` | `vibeplan_greenfield`, `vibeplan_codebase`, `studio`, `scrape`, `legacy_unknown` |
| `funding_source` | `subscription_balance`, `initial_analysis_allowance`, `exempt`, `trial`, `legacy_unknown` |
| `subscription_epoch` | `subscriptions.allocation_epoch` when the hold was made |

Integrity is enforced by the database, not only the service:

- `credit_operations_resource_check` requires exactly the column family of `resource_type`, and ties `product` and the `kind` prefix to it.
- Composite FKs `(studio_project_id, user_id)`, `(studio_job_id, studio_project_id, user_id)` and `(scrape_id, user_id)` bind every resource to the operation's user.
- No fake VibePlan project is created for Studio or Scrape.

`product` for new plan operations is derived from the verified `projects.project_mode`, never from the caller.

## Operation registry

`credit-operation-registry.ts` is the single source for kind, resource type, stage, source row and pricing.

| Key | Source |
| :--- | :--- |
| `studio.generate` / `add_frame` / `revise` / `regenerate` | `studio_jobs.job_type` `initial` / `add` / `revise` / `retry` |
| `scrape.crawl` / `html` / `images` / `design_md` | `scrapes.mode` `crawl` / `html` / `images` / `design` |

Reservation checks that the referenced job type or scrape mode matches the operation key.
Pricing is `adaptive`, `fixed` or `unconfigured`. Studio and Scrape are `unconfigured`:
`requireConfiguredPricing` throws `CreditPricingUnconfiguredError`, so quote, reservation and settlement all fail before any write. There is no zero placeholder tariff.

## Accounting invariants

- Reservation is one guarded `UPDATE` on the shared subscription row; concurrent spending across families cannot overspend.
- `(user_id, idempotency_key)` is unique; a reused key must match kind and resource or it is rejected.
- Settlement and release lock the operation and subscription rows; over-settlement, double settle and double release fail.
- Period resets (free rollover, plan purchase) zero `credits_reserved` and bump `allocation_epoch`. An operation from an older epoch can no longer release, settle, refund or quarantine against the new period's counters. Release writes only an audit entry coded `allocation_period_reset`; settle and refund throw `invalid_period` so the existing quarantine path takes over.
- Paid allocation and top-ups share one `subscriptions.credits` counter, so they are not split per operation. `trial` is representable and constrained to zero reserved credits but is never written yet (TASK 10).

## Migration `0045_universal_credit_ledger`

Additive. Historical amounts, states, pricing versions, timestamps and ledger rows are untouched.
Backfill uses evidence only: `projects.project_mode` (written once at insert) and `is_exempt` / `initial_analysis_allowance` / `subscription_id`. Contradictory rows (greenfield with codebase context) become `legacy_unknown`.

Verified on a disposable PostgreSQL 17: full chain 0000 to 0045 from empty, and a legacy fixture upgraded from 0044 with every historical field compared before and after.

Run the isolated suite:

```
initdb -D <tmp> -U postgres -A trust && pg_ctl -D <tmp> -o "-p 55432" start
CREDIT_ISOLATED_TEST_ADMIN_URL=postgresql://postgres@localhost:55432/postgres pnpm vitest run src/features/billing/tests/universal-credit-ledger.test.ts
```

## Pending dependencies

- Apply 0045 to staging and production; stop web and worker writers during the migration window.
- Studio projects, studio jobs and scrapes are hard-deleted today. Once charges exist the FKs block that deletion; TASK 11/12 must tombstone billed resources like `projects.deleted_at`.
- Tariffs: TASK 07 benchmark, TASK 09 approval, then set `pricing` per key.
- Trial entitlements: TASK 10.
- History UI and admin Kredit still read VibePlan labels; TASK 13/08.
