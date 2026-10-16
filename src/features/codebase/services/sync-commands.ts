const SAFE_PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

// Locked CLI invocation. The raw credential travels in `SyncPromptPayload`
// (`syncToken` field, exposed once); the command embeds only a placeholder so
// the credential never appears in a copyable string by accident. The project id
// must be a safe identifier (alphanumeric, dashes, underscores) to prevent shell
// metacharacter injection when copied into a terminal.
export function buildSyncCommand(projectId: string): string {
	if (!SAFE_PROJECT_ID_PATTERN.test(projectId)) {
		throw new Error(`Invalid project ID format: "${projectId}"`);
	}
	return `vibeeverything codebase sync --project-id ${projectId} --sync-token <token>`;
}
