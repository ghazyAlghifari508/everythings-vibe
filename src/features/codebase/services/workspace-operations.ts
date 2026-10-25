import type { CodebaseRunStage } from "./chat-flow-run";

export type DurableOperationStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface DurableGenerationOperation {
	id: string;
	projectId: string;
	stage: CodebaseRunStage;
	status: DurableOperationStatus;
	attempt?: number;
	error?: string | null;
	result?: Record<string, unknown> | null;
	createdAt?: string | number | null;
	startedAt?: string | number | null;
	finishedAt?: string | number | null;
	updatedAt?: string | number | null;
}

export interface GenerationSubmitPayload {
	projectId: string;
	stage: CodebaseRunStage;
	input: Record<string, unknown>;
	retry?: boolean;
}

export interface SubmitOperationResult {
	ok: boolean;
	operation: DurableGenerationOperation | null;
	error?: string;
	status: number;
	ackLost?: boolean;
	isFallback?: boolean;
}

export function emptyOperationsMap(): Record<
	CodebaseRunStage,
	DurableGenerationOperation | null
> {
	return {
		questions: null,
		feature: null,
		prd: null,
		ac: null,
		task: null,
	};
}

export function normalizeOperationsMap(
	data: unknown,
): Record<CodebaseRunStage, DurableGenerationOperation | null> {
	const result = emptyOperationsMap();
	if (!data || typeof data !== "object") return result;

	const record = data as Record<string, unknown>;
	const ops = record.operations ?? record;

	if (Array.isArray(ops)) {
		for (const item of ops) {
			if (
				item &&
				typeof item === "object" &&
				"stage" in item &&
				"status" in item
			) {
				const op = item as DurableGenerationOperation;
				if (op.stage in result) {
					const current = result[op.stage];
					const opTime = op.updatedAt ?? op.createdAt ?? 0;
					const curTime = current ? (current.updatedAt ?? current.createdAt ?? 0) : 0;
					if (!current || opTime >= curTime) {
						result[op.stage] = op;
					}
				}
			}
		}
	} else if (typeof ops === "object" && ops !== null) {
		for (const [key, val] of Object.entries(ops)) {
			if (
				val &&
				typeof val === "object" &&
				"stage" in val &&
				"status" in val
			) {
				const op = val as DurableGenerationOperation;
				if (op.stage in result) {
					result[op.stage] = op;
				}
			} else if (
				key in result &&
				val &&
				typeof val === "object" &&
				"status" in val
			) {
				const op = { ...val, stage: key } as DurableGenerationOperation;
				result[key as CodebaseRunStage] = op;
			}
		}
	}
	return result;
}

export async function fetchGenerationOperations(
	projectId: string,
	signal?: AbortSignal,
): Promise<Record<CodebaseRunStage, DurableGenerationOperation | null>> {
	try {
		const res = await fetch(
			`/api/codebase/generation?projectId=${encodeURIComponent(projectId)}`,
			{ signal },
		);
		if (!res.ok) return emptyOperationsMap();
		const body: unknown = await res.json().catch(() => null);
		return normalizeOperationsMap(body);
	} catch {
		return emptyOperationsMap();
	}
}

export async function submitGenerationOperation(
	payload: GenerationSubmitPayload,
	signal?: AbortSignal,
): Promise<SubmitOperationResult> {
	try {
		const res = await fetch("/api/codebase/generation", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal,
		});
		const body: unknown = await res.json().catch(() => null);
		if (!res.ok) {
			const errorMsg =
				body &&
				typeof body === "object" &&
				"error" in body &&
				typeof body.error === "string"
					? body.error
					: `Generasi gagal (${res.status}).`;
			return { ok: false, operation: null, error: errorMsg, status: res.status };
		}
		const op =
			body && typeof body === "object" && "operation" in body
				? (body as { operation: DurableGenerationOperation }).operation
				: (body as DurableGenerationOperation);
		return { ok: true, operation: op ?? null, status: res.status };
	} catch (err: unknown) {
		if (signal?.aborted) {
			return { ok: false, operation: null, status: 0, error: "Dibatalkan." };
		}
		// ponytail: ack-lost recovery polls server before reporting failure; upgrade to SSE replay if server supports it.
		try {
			const ops = await fetchGenerationOperations(payload.projectId);
			const existing = ops[payload.stage];
			if (
				existing &&
				(existing.status === "running" ||
					existing.status === "queued" ||
					existing.status === "completed")
			) {
				return { ok: true, operation: existing, status: 200, ackLost: true };
			}
		} catch {
			// server genuinely unreachable
		}
		return {
			ok: false,
			operation: null,
			error: "Koneksi terputus. Menghubungkan kembali...",
			status: 0,
		};
	}
}

export async function pollOperationUntilSettled({
	projectId,
	stage,
	operationId,
	signal,
	intervalMs = 1200,
	maxAttempts = 150,
	onTick,
}: {
	projectId: string;
	stage: CodebaseRunStage;
	operationId?: string;
	signal?: AbortSignal;
	intervalMs?: number;
	maxAttempts?: number;
	onTick?: (op: DurableGenerationOperation) => void;
}): Promise<DurableGenerationOperation | null> {
	let attempts = 0;
	// ponytail: fixed interval polling; upgrade to websocket/SSE push when backend streaming adapter is available.
	while (attempts < maxAttempts) {
		if (signal?.aborted) return null;
		attempts++;
		const ops = await fetchGenerationOperations(projectId, signal);
		if (signal?.aborted) return null;
		const op = ops[stage];
		if (op) {
			if (!operationId || !op.id || op.id === operationId) {
				onTick?.(op);
				if (
					op.status === "completed" ||
					op.status === "failed" ||
					op.status === "cancelled"
				) {
					return op;
				}
			}
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return null;
}
