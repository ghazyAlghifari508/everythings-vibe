You are a live QA engineer for NovaPlan — a TanStack Start + React app at http://localhost:3000 (dev server already running). Your job:
  run the full product-creation flow end-to-end FIVE (5) times, alternating the output language (Indonesian / English) so each round
  exercises a different language and a different platform (Web / Mobile). Catch any bug or error, fix it at the root cause, then re-run the
  flow until it passes clean.

  == WORKFLOW PER ROUND (repeat 5×) ==

  ROUND 1: language = ID, platform = WEB, backend stack includes "Insforge (BaaS)" + "PostgreSQL"
  ROUND 2: language = EN, platform = MOBILE, stack includes a NEW/NICHE platform to prove Context7 grounding
  actually injects real current docs
  ROUND 3: language = ID, platform = WEB, stack includes "TanStack Start" + "Better Auth" + "Neon"
  ROUND 4: language = EN, platform = MOBILE, ordinary stack (no niche platform) — control round
  ROUND 5: language = ID, platform = WEB, mixed stack incl. one niche platform + revision round (see step 5)

  For each round run these steps IN ORDER:

  1) PRE-CONDITION (server-side, via PowerShell against local Postgres connection in .env.local:
  postgresql://novaplan:novaplan_local@localhost:5432/novaplan):
     - Ensure the logged-in user has a subscription with plan 'hengker' (NOT 'free'!). The free tier is PRD-only — /api/ac/generate and
  /api/task/generate return 403 UPGRADE_REQUIRED. Set plan='hengker', status='active', credits=105, credits_used=0.
     - Free plan seed rule: every new OAuth user auto-creates a free subscription. If you authenticate as a fresh test user, UPDATE that
  row to hengker before generating AC/Task.
     - Confirm the app is reachable in the browser (ECC Chrome DevTools is already connected). Auth is OAuth-only (Google/GitHub), so if no
  valid session cookie exists, authenticate interactively in the browser (or via a session token row in the `sessions` table +
  better-auth.session_token cookie) — direct SQL seeding of a Better Auth session row (id, token, expires_at future, user_id) and setting
  the matching cookie is acceptable for tests.

  2) HOME FLOW: On / select the desired language in the bottom-left dropdown (expect label "ID Bahasa Indonesia" or "EN English"; NO '????'
  glyphs, NO '文A' icon, NO 'GB' anywhere). With the typing placeholder animating in the chosen language, type a product idea (≥20 chars)
  in that language. Choose Web or Mobile via the segmented toggle. Click send. Expect redirect to /login if unauthenticated, else to
  /ask/{id}.

  3) ASK FLOW: On /ask/{id}, verify Session 1 questions render in the SELECTED LANGUAGE (Indonesian questions for ID, English for EN).
  Answer all Session 1 questions. In Session 2 pick the round's tech stack (including the niche/brand-new platform named for the round).
  Submit. Expect redirect to /prd/{id} with AUTO PRD generation kicking off (POST /api/chat mode=generate, SSE stream).

  4) PRD GENERATION: Watch the SSE stream complete. Verify:
     - PRD section headers + body are in the selected language (technical terms may stay English — that
     - PRD sections are in the selected language (technical terms may stay English — correct behavior).
     - If the round's stack includes a niche/new platform (Insforge, mayar.id, mastra.ai), PRD must reflect REAL capabilities, not
  hallucinated APIs. Check the Network tab: during generation a request to https://mcp.context7.com/mcp must fire (≈≥1 outgoing Context7
  call). If the PRD invents fake endpoints/features for the niche platform, that's a grounding failure — bug.
     - Wait for `done` event; PRD auto-saved as v1. Confirm 1 credit burned on the plan row (credits_used +1).

  5) PRD REVISION (rounds 1–4: at least once; round 5: mandatory): In the chat panel send a revision instruction in the SAME language (e.g.
  "Ubah section arsitektur..."/"Change the architecture section..."). Expect mode=revise → PRD patched via :::UPDATE_SECTION blocks, NOT a
  full rewrite, still in the selected language. Verify the revised content actually changed and grounding fired for the revise call too. If
  revision rewrites the whole doc or ignores the language, that's a bug.

  6) AC GENERATION: Click Generate AC. POST /api/ac/generate. Expect AC content in the selected language + Again verify grounding (niche
  stack rounds: mcp.context7.com request visible; real platform details present). Wait for done; AC saved as v1; +1 credit.

  7) TASK GENERATION: Click Generate Task. POST /api/task/generate. Expect a JSON task tree whose name/descriptions are in the selected
  language. Verify task tree is well-formed (featureName groups + subtasks), rendered on the /task/{id} page. Wait for done; +1 credit;
  verify /kanban/{id} renders the tasks.

  8) END-TO-END CHECKS (every round):
     - Screenshot + text snapshot at home, ask, prd, ac, task, kanban.
     - Project language consistency: NO mixing — if round is ID, everything (questions, PRD, AC, tasks, error messages) is Indonesian
  except technical terms. If EN, everything English.
     - Network: capture list_network_requests for each phase — confirm SSE streams, /api/projects, /api/ask/options, /api/chat,
  /api/ac/generate, /api/task/generate fire; confirm Context7 calls fire for niche-stack rounds.
     - Console: list_console_messages — flag any error/warn; silent failures count as bugs.

  == BUG HANDLING ==
  If ANY step errors, 500s, hangs >60s, produces wrong-language content, hallucinates a niche platform's API, breaks the JSON, or shows a
  '????'/wrong glyph — STOP, investigate root cause (read server logs/route code), fix the code at the root, commit with a descriptive
  message, then RE-RUN the full round (plus re-verify the same fix didn't regress prior rounds). Never leave a bug unfixed — the goal is 5
  clean rounds with the full home→task pipeline + verified revision + verified Context7 grounding in both languages.

  == COMPLETION CRITERIA ==
  All 5 rounds pass end-to-end: project created, PRD + AC + Task generated in the correct language, PRD revision works, Context7 grounding
  verified live for the niche-stack rounds, zero unresolved console errors, zero hallucinated platform details. Report a structured
  summary: per-round result (PASS/FAIL + proof: model used, credits burned, language check, grounding check), every bug found + root cause
  + fix + re-test result. Commit + push every fix. pastikan kamu membaca, memahami dan mentaati 3 rules ya
  @[.agents/rules/ecc-gateguard.md] @[.agents/rules/no-assumptions.md] @[.agents/rules/novaplan-context.md] , pada saat implementasi
  perbaikan bug gunakan skill yang diperlukan seperti rules @[.agents/rules/no-assumptions.md] , live testing harus pake ecc-chrome gaboleh
  pake python atau script, dll!. jika ecc-chrome error tolong lapor ke saya nanti saya reconnect mcpnya, jangan berhenti sebelum tasknya
  selesai!
