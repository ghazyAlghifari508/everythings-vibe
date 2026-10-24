#!/usr/bin/env node

/**
 * everythings-vibe — CLI tool for everythings-vibe
 *
 * Supported executables:
 *   everythings-vibe (canonical)
 *   vibeeverything (backward-compatible alias)
 *   vibe (backward-compatible alias)
 *   prdfy (legacy backward-compatible alias)
 *
 * Usage:
 *   everythings-vibe login [--api-key <key>] [--api-url <url>]
 *   everythings-vibe project get <id>
 *   everythings-vibe task list <projectId> [--status <status>]
 *   everythings-vibe task next <projectId>
 *   everythings-vibe task update <taskId> --status <status>
 *   everythings-vibe subtask update <taskId> --index <subtaskIndex> --status <status>
 *   everythings-vibe kanban <projectId>
 *   everythings-vibe codebase sync --project-id <id>
 *   everythings-vibe export rules <projectId>
 *   everythings-vibe export plan <projectId>
 */

import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { acCommand } from "./commands/ac.js";
import { codebaseSyncAction } from "./commands/codebase.js";
import { exportRulesCommand } from "./commands/export.js";
import { exportPlanCommand } from "./commands/export-plan.js";
import { kanbanCommand } from "./commands/kanban.js";
import { loginCommand } from "./commands/login.js";
import { prdCommand } from "./commands/prd.js";
import { projectGetCommand } from "./commands/project.js";
import { subtaskUpdateCommand } from "./commands/subtask.js";
import {
	taskListCommand,
	taskNextCommand,
	taskUpdateCommand,
} from "./commands/task.js";
import { CLI_VERSION } from "./lib/version.js";

/** Shared program instance (exported so wiring tests can parse argv). */
export const program = new Command();

program
	.name("everythings-vibe")
	.description(
		"CLI tool for everythings-vibe — manage projects, codebases, and tasks from terminal",
	)
	.version(CLI_VERSION);

// everythings-vibe login
program
	.command("login")
	.description("Save API key to local config (interactive if no flag)")
	.option("--api-key <key>", "everythings-vibe API key")
	.option("--api-url <url>", "API base URL (default: http://localhost:3000)")
	.action(loginCommand);

// everythings-vibe project
const projectCmd = program.command("project").description("Project commands");
projectCmd
	.command("get")
	.argument("<id>", "Project UUID")
	.description("Get project data as JSON")
	.action(projectGetCommand);

// everythings-vibe prd
program
	.command("prd")
	.argument("<projectId>", "Project UUID")
	.description("Fetch and print PRD content")
	.action(prdCommand);

// everythings-vibe ac
program
	.command("ac")
	.argument("<projectId>", "Project UUID")
	.description("Fetch and print Acceptance Criteria content")
	.action(acCommand);

// everythings-vibe task
const taskCmd = program.command("task").description("Task commands");
taskCmd
	.command("list")
	.argument("<projectId>", "Project UUID")
	.description("List all tasks for a project")
	.option(
		"--status <status>",
		"Filter by status (pending/in_progress/completed/failed)",
	)
	.action(taskListCommand);
taskCmd
	.command("next")
	.argument("<projectId>", "Project UUID")
	.description("Show next pending task with details")
	.action(taskNextCommand);
taskCmd
	.command("update")
	.argument("<taskId>", "Task UUID")
	.description("Update task status")
	.requiredOption(
		"--status <status>",
		"New status (pending/in_progress/completed/failed)",
	)
	.action(taskUpdateCommand);

// everythings-vibe subtask
const subtaskCmd = program.command("subtask").description("Subtask commands");
subtaskCmd
	.command("update")
	.argument("<taskId>", "Parent task UUID")
	.description("Update subtask status")
	.requiredOption("--index <index>", "Subtask index (0-based)")
	.requiredOption(
		"--status <status>",
		"New status (pending/in_progress/completed/failed)",
	)
	.action(subtaskUpdateCommand);

// everythings-vibe kanban
program
	.command("kanban")
	.argument("<projectId>", "Project UUID")
	.description("Show kanban board in terminal")
	.action(kanbanCommand);

// everythings-vibe codebase
const codebaseCmd = program
	.command("codebase")
	.description("Codebase commands");
codebaseCmd
	.command("sync")
	.description("Sync a filtered local repository snapshot to everythings-vibe")
	.requiredOption("--project-id <id>", "Project UUID")
	.option(
		"--sync-token <token>",
		"Project-scoped sync token (prefer EVERYTHINGS_VIBE_SYNC_TOKEN env var; never stored)",
	)
	.option("--root <path>", "Repository root (default: current directory)")
	.option("--output <mode>", "Output mode (human|json)", "human")
	.option("--api-url <url>", "API base URL")
	.action(codebaseSyncAction);

// everythings-vibe export
const exportCmd = program
	.command("export")
	.description("Export project artifacts");
exportCmd
	.command("rules")
	.argument("<projectId>", "Project UUID")
	.description(
		"Generate agent rules file with PRD stack + AC (--format agents writes AGENTS.md)",
	)
	.option("--format <format>", "Output format (agents|claude|cursor)")
	.action(exportRulesCommand);
exportCmd
	.command("plan")
	.argument("<projectId>", "Project UUID")
	.description("Export planning artifacts to docs/vibeplan/ for a coding agent")
	.option("--root <path>", "Repository root (default: current directory)")
	.option("--output <mode>", "Output mode (human|json)", "human")
	.option("--api-url <url>", "API base URL")
	.action(exportPlanCommand);

// Parse only when executed as the CLI entrypoint; importing this module
// (e.g. wiring tests) must not consume the importer's argv.
const invokedAsMain =
	typeof process.argv[1] === "string" &&
	import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
	await program.parseAsync(process.argv);
}
