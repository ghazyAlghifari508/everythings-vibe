import crypto from "node:crypto";

export function canonicalStringify(obj: unknown): string {
	if (obj === null || typeof obj !== "object") {
		return JSON.stringify(obj);
	}
	if (Array.isArray(obj)) {
		return `[${obj.map(canonicalStringify).join(",")}]`;
	}
	const record = obj as Record<string, unknown>;
	const keys = Object.keys(record)
		.filter((k) => record[k] !== undefined)
		.sort();
	return `{${keys
		.map((k) => `${JSON.stringify(k)}:${canonicalStringify(record[k])}`)
		.join(",")}}`;
}

function normalizeInput(
	input: Record<string, unknown> | unknown,
	projectId: string,
): unknown {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return input ?? {};
	}
	const result: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
		if (val === undefined) continue;
		// Strip redundant projectId matching request outer projectId, or transient request flags
		if (key === "projectId" && (val === projectId || val === undefined))
			continue;
		if (key === "idempotencyKey" || key === "attempt" || key === "retry")
			continue;
		result[key] = val;
	}
	return result;
}

export interface ComputeGenerationIdentityHashParams {
	userId: string;
	projectId: string;
	stage: string;
	inputRevision?: string | null;
	input: Record<string, unknown>;
}

export function computeGenerationIdentityHash(
	params: ComputeGenerationIdentityHashParams,
): string {
	const normalizedInput = normalizeInput(params.input, params.projectId);
	const canonicalPayload = canonicalStringify({
		userId: params.userId,
		projectId: params.projectId,
		stage: params.stage,
		inputRevision: params.inputRevision ?? null,
		input: normalizedInput,
	});
	return crypto.createHash("sha256").update(canonicalPayload).digest("hex");
}
