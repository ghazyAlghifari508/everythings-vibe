export type ApiKeyScope =
	| "read:project"
	| "write:task:status"
	| "write:subtask:status";

/**
 * Every scope a bearer credential can carry. The CLI transport and the
 * `/api/v1` surface are the only consumers, so nothing broader (no `admin`,
 * no wildcard, no `codebase:sync`) is grantable through these endpoints:
 * codebase sync mints its own credential kind.
 */
export const API_KEY_SCOPES = [
	"read:project",
	"write:task:status",
	"write:subtask:status",
] as const satisfies readonly ApiKeyScope[];

export function isApiKeyScope(value: string): value is ApiKeyScope {
	return (API_KEY_SCOPES as readonly string[]).includes(value);
}

/** Scopes an automatic AI-agent handoff credential receives: exactly what the
 * handoff prompt tells the agent to do (read plan artifacts, write task and
 * subtask status). */
export const AUTO_API_KEY_SCOPES: ApiKeyScope[] = [...API_KEY_SCOPES];

export const API_KEY_SCOPE_OPTIONS: ReadonlyArray<{
	value: ApiKeyScope;
	label: string;
}> = [
	{ value: "read:project", label: "Read project data" },
	{ value: "write:task:status", label: "Update task status" },
	{ value: "write:subtask:status", label: "Update subtask status" },
];
