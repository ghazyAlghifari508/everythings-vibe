# No-Assumption &amp; Deep Analysis Rules

## Core Principle

**NEVER answer from assumptions.** Every claim about the codebase must be verified with tools. Every implementation must be grounded in actual code evidence. Guessing wastes user time and ships broken code.

---

## Rule 1: No Assumption Responses

When the user asks a question about the app, codebase, features, bugs, errors, design, UX, or architecture:

1. **Do NOT answer from memory or training data.** Your memory of this codebase is unreliable.
2. **Do NOT assume file contents, function signatures, or behavior.** Read the file first.
3. **Do NOT assume "it probably works like X."** Verify with grep/read/glob.
4. **If you don't know, say "I don't know, let me check."** Then use tools to find out.

### Red Flags in Your Own Responses

If you catch yourself saying any of these, STOP — you're guessing:

- "I think this file..."
- "This probably means..."
- "Based on typical Next.js apps..."
- "The error is likely caused by..."
- "I believe the issue is..."
- "Most likely..."
- "X tidak ada / doesn't exist / belum ada" (after only one or two searches)
- "There's no CLI/test/endpoint for this" (without stating WHERE you searched)

Replace with: "Let me verify" → then use tools.

---

## Rule 2: Brainstorm Before Answering Complex Questions

When the user asks a question that requires analysis, design thinking, or multiple possible approaches:

1. **Identify if brainstorming is needed.** Questions like:
  - "How should we implement X?"
  - "What's the best approach for Y?"
  - "Why is this happening?"
  - "How do we fix this?"
  - "What do you think about Z?"
  - Any question with multiple valid answers
2. **Brainstorm BEFORE responding.** Use the brainstorming skill if available. If not:
  - List 2-3 possible approaches
  - For each: pros, cons, effort level
  - Recommend one with reasoning grounded in the actual codebase
3. **Do NOT give a single answer without exploring alternatives.** The first idea is rarely the best one.
4. **Do NOT brainstorm in silence.** Show your thinking to the user. They may have context you lack.

---

## Rule 3: Deep Audit Before Implementation

Before implementing ANY change related to features, bugs, errors, design, or UX:

### Step 1: Understand the Current State

```
1. Read the relevant files (not just the target file — read its callers, imports, and dependencies)
2. Trace the execution flow end-to-end
3. Identify ALL files that will be affected by the change
4. Check existing patterns — how has this codebase solved similar problems before?
```

### Step 2: Root Cause Analysis (for bugs/errors)

```
1. Do NOT fix symptoms. Find root cause.
2. Reproduce the issue mentally or with tools
3. Trace from the error message back to the source
4. Check recent git changes that may have introduced the bug
5. Verify the fix addresses root cause, not just the visible symptom
```

### Step 3: Impact Assessment

```
1. What files change?
2. What depends on those files?
3. What could break?
4. Is this change backward-compatible?
5. Are there tests that need updating?
```

---

## Rule 4: Use Relevant Skills & MCP (Single Source of Truth)

Seluruh aturan pemilihan skill, alur proses (`brainstorming` -> `prototype` (opsional: validasi state logic / eksperimen layout UI) -> `writing-plans` -> `executing-plans`), registry MCP, dan matriks tools PRDFY dikelola secara terpusat (Single Source of Truth) di:
- [skills-mcp.md](.opencode/rules/skills-mcp.md)

**Prinsip Utama:**
1. Sebelum melakukan tindakan apa pun (eksplorasi, klarifikasi, refaktor, coding, atau live QA), cek dan jalankan skill yang relevan melalui file aturan di atas.
2. Jangan menduplikasi daftar skill atau berasumsi mengenai ketersediaan pustaka/tool; selalu jadikan `skills-mcp.md` sebagai rujukan utama.

---

## Rule 5: Verify Every Claim

Before stating ANY fact about the codebase, verify it:


| You Want to Say              | Verify With                   |
| ---------------------------- | ----------------------------- |
| "File X does Y"              | `read` the file               |
| "Function Z is called by..." | `grep` for callers            |
| "This component uses..."     | `read` the component          |
| "The error comes from..."    | `grep` for the error message  |
| "This pattern is used in..." | `grep` for the pattern        |
| "No files depend on this"    | `grep` for imports/references |


**If you cannot verify a claim, state the uncertainty explicitly.**

### Rule 5A: Absence Claims Are The Highest-Risk Claims (Anti-Hallucination Hard Mode)

Claiming **"X tidak ada / doesn't exist / belum diimplementasi"** is the single most dangerous sentence an AI can produce about a codebase. Two failed searches are NOT proof of absence — they only prove "not found in the exact paths and patterns I tried."

**Real incident (2026-08-24):** AI claimed *"CLI tidak ada di repo ini"* after globbing `cli/**` at repo root once. The CLI lived in `packages/cli/` — a monorepo workspace the AI never listed, never checked, never knew existed. User had to correct it manually.

#### Mandatory protocol before ANY absence claim

```
1. LIST repo root directories        — see what actually exists (packages/? apps/? tools/?)
2. READ workspace config             — package.json#workspaces, pnpm-workspace.yaml,
                                       turbo.json → map EVERY package root BEFORE searching
3. GLOB each mapped root             — not just cwd
4. GREP keyword repo-wide            — name, command name, bin entry, package.json#bin
5. STATE your coverage               — "Saya cari di [paths], pattern [X], hasil nihil"
```

Only after all 5 steps may you report a negative result — and even then, phrase it as coverage, never as absolute fact:

> ✅ "Tidak saya temukan di [packages/, src/, apps/] dengan pattern [X]. Kalau kamu yakin ada, tunjukkan lokasinya."
>
> ❌ ~~"CLI gak ada."~~ ❌ ~~"Belum ada implementasinya."~~ ❌ ~~"There is no test for this."~~

#### Red flags you're about to hallucinate an absence

- You searched ONCE and found nothing
- Your search paths were only adjacent to what the conversation mentioned
- You feel confident because "it would surely be in src/"
- You're composing a sentence containing "tidak ada", "doesn't exist", "no such", "there is no"
- You never listed the top-level directories of the repo this session

#### When the user corrects you

1. **Re-verify FIRST with broader scope** — run the searches before responding; the user can be wrong too, but assume they're right until tools say otherwise
2. **Name your exact failure mode**: "glob saya cuma cover `cli/**` di root, tidak cover `packages/`" — bukan sekadar "maaf"
3. **Fix the process gap**, don't just apologize — identify which step of the protocol you skipped

---

## Rule 6: No Hallucinated Code

When writing or editing code:

1. **Read the file first.** Never write to a file you haven't read in this conversation.
2. **Check existing patterns.** Look at how similar code is written in this project.
3. **Verify imports exist.** Don't import from paths you haven't confirmed.
4. **Check types.** Don't assume type signatures — read the type definitions.
5. **Test your logic mentally.** Walk through the code with sample inputs before committing.

---

## Rule 7: Explain Before Implementing

Before making significant changes:

1. **State what you found** from your analysis
2. **State what you plan to change** and why
3. **State the risk** — what could break
4. **Wait for user confirmation** if the change is non-trivial

Exception: trivial fixes (typo, obvious one-liner) — just do it and report.

---

## Rule 8: Commit + Push After Every Task

After completing any task:

1. `git add` the changed files
2. `git commit` with a descriptive message
3. `git push` to remote

No exceptions unless user explicitly says otherwise.

---

## Anti-Patterns


| Anti-Pattern                                                    | Why It's Wrong                                     | Correct Behavior                                     |
| --------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Answering "I think it's because..."                             | Guessing, may mislead                              | "Let me check" → tools                               |
| Fixing without reading callers                                  | May break other code                               | Grep for all callers first                           |
| Assuming file contents                                          | Files change, memory is stale                      | Read the file                                        |
| Skipping brainstorm                                             | First idea often wrong                             | List alternatives, compare                           |
| Implementing without skill check                                | Missing established workflows                      | Check skills first                                   |
| "This is a simple change"                                       | Simple changes break things too                    | Still do impact assessment                           |
| Claiming "no dependencies" without searching                    | May have hidden imports                            | Grep for references                                  |
| Empty glob/grep → "X doesn't exist"                             | Search miss ≠ proof of absence; coverage unknown   | Run Rule 5A protocol, then hedge                     |
| Searching only repo root in a monorepo                          | Code often lives in `packages/`, `apps/`, `tools/` | Map workspace roots FIRST (Rule 5A step 1–2)         |
| Absolute phrasing for negative results ("tidak ada", "no such") | Sounds authoritative, is unverified                | Coverage phrasing: "not found in [paths × patterns]" |
| Apologizing vaguely when corrected                              | Same failure recurs next session                   | Name exact search gap + re-verify with broader scope |
| Using training data for library APIs                            | APIs change, training data is old                  | Use Context7 or docs                                 |


---

## Rule 9: Gunakan Bahasa Indonesia

Selalu jawab pertanyaan user dalam **Bahasa Indonesia** kecuali:

- User menulis dalam bahasa Inggris → jawab bahasa Inggris
- User menulis dalam bahasa lain → jawab dalam bahasa yang sama
- Kode, error message, nama file, nama fungsi, URL → tetap dalam bahasa aslinya (English)
- Commit message, PR description → English (standar git)

**Jangan translate istilah teknis** — tetap pakai nama asli: React hooks, database query, API endpoint, polling, caching, dll. Jangan dipaksa jadi bahasa Indonesia ("kait reaksi", "kueri basis data").

Pattern: penjelasan → Bahasa Indonesia. Kode/teknis → English as-is.

---

## Summary

1. **No assumptions** — verify everything with tools
2. **Brainstorm first** — explore alternatives before recommending
3. **Deep audit** — understand the codebase before changing it
4. **Use skills** — leverage established workflows
5. **Verify claims** — every fact needs evidence
6. **Absence claims = highest risk** — full Rule 5A protocol (map roots → search all → state coverage) atau jangan klaim sama sekali
7. **No hallucinated code** — read before write
8. **Explain before implement** — state findings and plan
9. **Commit + push** — every task, no exceptions

