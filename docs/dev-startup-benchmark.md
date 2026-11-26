# Local development startup benchmark (p1)

Environment: Node `v24.20.0`, pnpm `11.17.0`, Vite `8.1.5`, `@tanstack/react-start` `1.169.4`, Windows 11 (NTFS).
All timings are wall-clock from process spawn; "first HTML" is the first successful `GET /` response with non-empty HTML, measured 100 ms after Vite prints `ready in`. Browser visual readiness was **not** measured.

## Measured baseline (before changes)

| Scenario | Command to Ready | Dependency optimization | First HTML | Worker readiness |
| --- | --- | --- | --- | --- |
| `pnpm dev`, valid cache, broad SSR warmup | 5.1 s | none (reuse) | 33.5 s | n/a |
| `pnpm dev`, valid cache, no warmup (diagnostic) | 3.3 s | none (reuse) | 29.8 s | n/a |
| `pnpm dev:all`, valid cache, 2 consecutive runs | 5.9 / 6.0 s | none (reuse) | 34.8 / 34.4 s | scrape 4.3 / 4.2 s, studio 22.2 / 21.1 s, durable 2.8 s |
| `pnpm dev:all`, config changed | 7.8 s | re-opt 6.4 s, scan 9.6 s, bundle 12.6 s | 54.2 s | studio 35.4 s |
| Cold optimizer cache, old warmup, single request, 2 runs | 4.0 / 3.5 s | scan 5.0 s, bundle 11.0 s | 56.1 / 36.7 s | n/a |

Standalone overhead: `pnpm --version` 571–644 ms, `pnpm studio:assets:check` 1466–1757 ms, `node --import tsx -e ...` ~183 ms.

## Root causes identified

1. **First HTML is dominated by SSR module work, not by Vite's Ready line.** Profiling showed ~807 modules transformed/evaluated on the first request. Transform + load totals were 7–7.7 s and 3.9 s respectively, but wall time was ~26–29 s; the remaining time is Node ESM resolution/evaluation on Windows plus CPU contention with three workers.
2. **Broad SSR warmup violated Vite's own guidance** ("only add frequently used files"). Globs `src/routes/**/*.ts(x)` warmed the whole route graph, including route test files, on every restart. A/B with identical conditions: old warmup 34.0 / 33.2 s, no warmup 32.9 / 35.7 s — no first-HTML benefit; targeted homepage-only warmup was 34.6 s. Warmup was removed.
3. **Nested pnpm spawn.** `dev` and `dev:all` invoked `pnpm studio:assets && ...`, adding a full pnpm startup (~600 ms measured) before any useful work.
4. **Optimizer invalidation is legitimate, not per-restart.** Vite `getConfigHash` includes plugin names, `optimizeDeps.include`, root and resolve settings; `lockfileHash` stayed `89efeba7` across unchanged restarts. Consecutive `dev:all` runs showed zero re-optimization. Re-optimization only followed config edits (e.g. `configHash` `d27d8e7f` → `eca86ac1`). No cache metadata was faked and `--force` was not introduced.
5. **Worker contention is real but staging did not help first HTML.** Staging workers until Vite Ready gave first HTML 33.7 s (vs 33.5 s warmup-only baseline) while delaying worker readiness. Workers were left concurrent.
6. **localhost/IPv4 gap not reproduced.** Warm requests: `127.0.0.1` connect 0.7–1.3 ms, TTFB 27–41 ms; `localhost` connect 0.6–0.8 ms, TTFB 26–32 ms. No networking or origin-contract change made.

## Changes made

- `vite.config.ts`: removed `server.warmup.ssrFiles` broad globs; kept `autoCodeSplitting`, the existing optimized-dep includes, plugins, and build chunking unchanged.
- `package.json`: `dev` and `dev:all` now call `tsx src/features/studio/services/studio-skill-assets-build.ts` directly instead of spawning nested `pnpm studio:assets`. Asset verification still runs first and still fails startup on error.

All four workers, Studio assets, SSR, auth, and billing behaviour remain intact.

## Measured after changes

| Scenario | Command to Ready | Dependency optimization | First HTML | Worker readiness |
| --- | --- | --- | --- | --- |
| `pnpm dev`, valid cache | 4.8 s | none (reuse) | 33.6 s | n/a |
| `pnpm dev:all`, valid cache, 4 runs | 5.1–5.8 s | none (reuse) | 35.1 / 35.4 / 37.2 / 37.3 s | scrape 3.6–3.8 s, studio 21.0–25.4 s, durable 2.0–2.3 s |
| Cold optimizer cache, 2 runs | 5.5 s | scan 7.0 s, bundle 9.8 s | 37.7 / 37.4 s | n/a |
| `pnpm dev` after config edit (one-time) | 5.8 s | re-opt 5.4 s | 44.5 s | n/a |

Interpretation: the deterministic wins are one fewer nested pnpm startup and elimination of whole-route-graph warmup work. The first-HTML deltas are within run-to-run variance on this shared machine (same-config runs ranged 27–47 s), so no first-HTML speedup is claimed from those numbers alone. The 29–37 s first response remains dominated by ~800 SSR module loads under Windows and worker contention.

## Investigated, not adopted

- **Deep icon imports** (`@hugeicons/core-free-icons/dist/esm/<Icon>.js` via alias): one A/B showed 27.1 s vs 29.8 s, but alternating reruns ranged 26.6–47.4 s; a checked-in generated wrapper would add stale-import maintenance. Skipped.
- **Virtual deep-icon plugin**: 41.4 s (worse; Vite resolved 148 absolute imports individually).
- **Devtools stubs**: 38.3 s vs ~33–36 s control; no gain.
- **Worker staging after Vite Ready**: no first-HTML gain; rejected.
- **Selective homepage warmup**: 34.6 s vs 29.8 s no warmup; rejected.

## Verification and limitations

- `pnpm biome check vite.config.ts package.json`: clean.
- `pnpm exec tsc --noEmit`: exit 0.
- Full `pnpm dev:all` observed with all four workers and HTTP 200 HTML response; no worker disabled and no asset generation removed.
- Browser visual readiness / hydration timing is **not** measured here. p1 defers browser QA to the final integration task; HTTP readiness is not visual readiness.
- Timing noise is substantial on this machine (other processes and agents share CPU); report ranges rather than single-point claims.
