import { formatDate } from "@/lib/utils";
import type { ProjectExportPayload } from "../types/export-contracts";
import { AI_AGENT_PROMPT_TEMPLATE } from "./ai-agent-prompt-template";

/** Shown when the automatic credential could not be minted: the handoff stays
 * usable and the user sees exactly which line to fill in. */
export const MISSING_API_KEY_PLACEHOLDER = "<GANTI_DENGAN_API_KEY_KAMU>";

export const MISSING_ARTIFACT_LABELS = {
	prd: "(Belum ada PRD)",
	ac: "(Belum ada AC)",
	tasks: "(Belum ada tasks)",
} as const;

export interface AgentHandoffCredential {
	apiKey: string;
	expiresAt: string | null;
}

/**
 * Fills every placeholder of the handoff template. The credential deadline is
 * part of the contract given to the external agent: without it a long
 * implementation run discovers the expiry only as a 401, mid-task.
 */
export function buildAgentHandoffPrompt(input: {
	payload: ProjectExportPayload;
	projectId: string;
	projectNameFallback: string;
	credential: AgentHandoffCredential;
}): string {
	const { payload, projectId, projectNameFallback, credential } = input;
	const replacements: Record<string, string> = {
		projectName: payload.projectName || projectNameFallback,
		prdContent: payload.prd ?? MISSING_ARTIFACT_LABELS.prd,
		acContent: payload.ac ?? MISSING_ARTIFACT_LABELS.ac,
		tasksContent: payload.tasks ?? MISSING_ARTIFACT_LABELS.tasks,
		projectId,
		keyExpiresAt: credential.expiresAt
			? formatDate(credential.expiresAt)
			: "waktu yang ditentukan server",
		apiKey: credential.apiKey || MISSING_API_KEY_PLACEHOLDER,
	};
	// One pass keeps document content literal and cannot expand secret markers inside it.
	return AI_AGENT_PROMPT_TEMPLATE.replace(
		/\{(projectName|prdContent|acContent|tasksContent|projectId|keyExpiresAt|apiKey)\}/g,
		(marker, name: string) => replacements[name] ?? marker,
	);
}
