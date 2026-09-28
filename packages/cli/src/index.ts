#!/usr/bin/env node

/**
 * vibeeverything-cli — CLI tool for VibeEverything
 *
 * Usage:
 *   vibeeverything login [--api-key <key>] [--api-url <url>]
 *   vibeeverything project get <id>
 *   vibeeverything task list <projectId> [--status <status>]
 *   vibeeverything task next <projectId>
 *   vibeeverything task update <taskId> --status <status>
 *   vibeeverything subtask update <taskId> --index <subtaskIndex> --status <status>
 *   vibeeverything kanban <projectId>
 */

import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { acCommand } from "./commands/ac.js";
import { codebaseSyncAction } from "./commands/codebase.js";
import { exportRulesCommand } from "./commands/export.js";
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
	.name("vibeeverything")
	.description("CLI tool for VibeEverything — manage projects and tasks from terminal")
	.version(CLI_VERSION);

// vibeeverything login
program
	.command("login")
	.description("Save API key to local config (interactive if no flag)")
	.option("--api-key <key>", "VibeEverything API key")
	.option("--api-url <url>", "API base URL (default: http://localhost:3000)")
	.action(loginCommand);

// vibeeverything project
const projectCmd = program.command("project").description("Project commands");
projectCmd
	.command("get")
	.argument("<id>", "Project UUID")
	.description("Get project data as JSON")
	.action(projectGetCommand);

// vibeeverything prd
program
	.command("prd")
	.argument("<projectId>", "Project UUID")
	.description("Fetch and print PRD content")
	.action(prdCommand);

// vibeeverything ac
program
	.command("ac")
	.argument("<projectId>", "Project UUID")
	.description("Fetch and print Acceptance Criteria content")
	.action(acCommand);

// vibeeverything task
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

// vibeeverything subtask
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

// vibeeverything kanban
program
	.command("kanban")
	.argument("<projectId>", "Project UUID")
	.description("Show kanban board in terminal")
	.action(kanbanCommand);

// vibeeverything codebase
const codebaseCmd = program
	.command("codebase")
	.description("Codebase commands");
codebaseCmd
	.command("sync")
	.description("Sync a filtered local repository snapshot to VibeEverything")
	.requiredOption("--project-id <id>", "Project UUID")
	.option(
		"--sync-token <token>",
		"Project-scoped sync token (prefer PRDFY_SYNC_TOKEN env var; never stored)",
	)
	.option("--root <path>", "Repository root (default: current directory)")
	.option("--output <mode>", "Output mode (human|json)", "human")
	.option("--api-url <url>", "API base URL")
	.action(codebaseSyncAction);

// vibeeverything export
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

// Parse only when executed as the CLI entrypoint; importing this module
// (e.g. wiring tests) must not consume the importer's argv.
const invokedAsMain =
	typeof process.argv[1] === "string" &&
	import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) {
	await program.parseAsync(process.argv);
}
