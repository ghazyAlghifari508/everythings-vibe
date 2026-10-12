# @ghazynabiel/vibeeverything

Official command-line interface for [VibeEverything](https://github.com/ghazyAlghifari508/prdfy).

## Installation

```bash
npm install -g @ghazynabiel/vibeeverything
```

Check version:

```bash
vibeeverything --version
```

The package also installs the `vibe` and `prdfy` binaries as aliases, so existing
scripts and documentation that call `prdfy <command>` keep working.

Minimum version required for existing codebase sync is **2.0.0**.

## Commands

### Codebase Sync

Synchronize a filtered repository snapshot to VibeEverything for existing-codebase project planning:

```bash
vibeeverything codebase sync --project-id <id> --sync-token <token>
```

#### Options

- `--project-id <id>`: Project UUID (required)
- `--sync-token <token>`: Project-scoped temporary sync token (required)
- `--root <path>`: Repository root. Detected automatically when omitted.
- `--output <mode>`: Output format (`human` or `json`, default: `human`)
- `--api-url <url>`: VibeEverything server base URL (default: `http://localhost:3000`)

#### Automatic preparation

The CLI performs every preparation step; the agent prompt only requests the
sync. Running the command from a subdirectory is safe.

- **Repository root** — an explicit `--root` wins. Otherwise the CLI walks up
  to the nearest ancestor containing a `.git` entry (a file counts, so
  worktrees and submodules resolve). Without any marker it falls back to the
  current directory.
- **`.everythingsvibeignore`** — created from the default template when no
  custom ignore file exists, and never overwritten. A legacy `.prdfyignore`
  is still honored when the canonical file is absent. The file is local sync
  configuration; the CLI does not run git, so it is never committed or pushed
  automatically.
- **Version** — the server advertises its minimum version during handshake and
  the CLI fails closed when it is too old. When the running version is below
  that minimum, the notice and the exact upgrade command are printed.
- **Ignore validation** — negation patterns (`!pattern`) are inert and are
  reported as a warning, because user rules must never lift the built-in
  secret and unsafe-path protection.

### Filtering & `.everythingsvibeignore`

The CLI automatically excludes:
- Environment variables and secrets (`.env*`, `*.pem`, `*.key`, `*.p12`)
- Dependency and build folders (`node_modules/`, `dist/`, `build/`, `coverage/`, `.git/`)
- Local deployment state folders (`.vercel/`) at any depth — the folder only; deployment
  configuration that is meant to be versioned (`vercel.json`, `netlify.toml`, `fly.toml`,
  `railway.json`, `wrangler.toml`, workflows) is still synchronized
- Binary files and SQLite/local database files
- Its own ignore control files (`.everythingsvibeignore` and legacy `.prdfyignore`)

Custom exclusions can be added to `.everythingsvibeignore` in your repository root. The
file is created for you on the first sync with the built-in coverage documented
in its header, so you only add repository-specific patterns. A pre-existing
`.prdfyignore` keeps working until you create the canonical file. Negation patterns are
inert, so a custom rule can never re-include a built-in exclusion.

#### Filtering applies to new syncs only

Built-in exclusions are evaluated by the CLI while it builds a snapshot. A snapshot that
was already uploaded keeps the file set it was uploaded with — updating the CLI does not
rewrite stored snapshots. After upgrading to **3.2.0** (`.vercel/` exclusion), run
`vibeeverything codebase sync` again to produce a snapshot without the local Vercel
state directory. The repository working tree is never modified by this: the CLI only
reads files and never edits your `.gitignore`, `.everythingsvibeignore`, or `.vercel/`.

The server-side minimum CLI version stays at **2.0.0**; this filtering change does not
require it to be raised.

### Authentication for Task Management

For general task and kanban tracking:

```bash
vibeeverything login --api-key <your-api-key>
```

### Projects, Tasks, and Kanban

```bash
vibeeverything project get <projectId>
vibeeverything prd <projectId>
vibeeverything ac <projectId>
vibeeverything task list <projectId> [--status <status>]
vibeeverything task next <projectId>
vibeeverything task update <taskId> --status <status>
vibeeverything subtask update <taskId> --index <index> --status <status>
vibeeverything kanban <projectId>
vibeeverything export rules <projectId> [--format agents|claude|cursor]
```
