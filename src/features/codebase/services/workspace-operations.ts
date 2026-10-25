import {
	type WorkspaceGenerationOperation,
	workspaceGenerationOperationSchema,
} from "../types/workspace-generation";
import type { CodebaseRunStage } from "./chat-flow-run";

export type DurableOperationStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export type DurableGenerationOperation = WorkspaceGenerationOperation;

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

export type OperationsFetchResult =
	| {
			status: "available";
			operations: Record<CodebaseRunStage, DurableGenerationOperation | null>;
	  }
	| {
			status: "unavailable";
			error: string;
	  };

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

function toIsoString(val: unknown): string | undefined {
	if (typeof val === "string") return val;
	if (typeof val === "number" && !Number.isNaN(val))
		return new Date(val).toISOString();
	if (val instanceof Date) return val.toISOString();
	return undefined;
}

export function parseOperation(
	data: unknown,
): DurableGenerationOperation | null {
	if (!data || typeof data !== "object") return null;
	const raw =
		"operation" in data &&
		typeof (data as { operation: unknown }).operation === "object" &&
		(data as { operation: unknown }).operation !== null
			? (data as { operation: unknown }).operation
			: data;
	if (!raw || typeof raw !== "object") return null;
	const candidate = { ...(raw as Record<string, unknown>) };

	if (candidate.createdAt !== undefined && candidate.createdAt !== null) {
		const iso = toIsoString(candidate.createdAt);
		if (iso) candidate.createdAt = iso;
	} else {
		candidate.createdAt = new Date().toISOString();
	}

	if (candidate.updatedAt !== undefined && candidate.updatedAt !== null) {
		const iso = toIsoString(candidate.updatedAt);
		if (iso) candidate.updatedAt = iso;
	} else {
		candidate.updatedAt = candidate.createdAt;
	}

	if (candidate.startedAt !== undefined && candidate.startedAt !== null) {
		const iso = toIsoString(candidate.startedAt);
		if (iso) candidate.startedAt = iso;
	}

	if (candidate.finishedAt !== undefined && candidate.finishedAt !== null) {
		const iso = toIsoString(candidate.finishedAt);
		if (iso) candidate.finishedAt = iso;
	}

	const parsed = workspaceGenerationOperationSchema.safeParse(candidate);
	if (!parsed.success) return null;
	return parsed.data;
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
			const op = parseOperation(item);
			if (op && op.stage in result) {
				const current = result[op.stage];
				const opTime = op.updatedAt ? Number(new Date(op.updatedAt)) : 0;
				const curTime = current?.updatedAt
					? Number(new Date(current.updatedAt))
					: 0;
				if (!current || opTime >= curTime) {
					result[op.stage] = op;
				}
			}
		}
	} else if (typeof ops === "object" && ops !== null) {
		for (const [key, val] of Object.entries(ops)) {
			let op = parseOperation(val);
			if (!op && val && typeof val === "object" && !("stage" in val)) {
				op = parseOperation({ ...val, stage: key });
			}
			if (op && op.stage in result) {
				const current = result[op.stage];
				const opTime = op.updatedAt ? Number(new Date(op.updatedAt)) : 0;
				const curTime = current?.updatedAt
					? Number(new Date(current.updatedAt))
					: 0;
				if (!current || opTime >= curTime) {
					result[op.stage] = op;
				}
			}
		}
	}
	return result;
}

export async function fetchGenerationOperations(
	projectId: string,
	signal?: AbortSignal,
): Promise<OperationsFetchResult> {
	try {
		const res = await fetch(
			`/api/codebase/generation?projectId=${encodeURIComponent(projectId)}`,
			{ signal, headers: { Accept: "application/json" } },
		);
		if (!res.ok) {
			return {
				status: "unavailable",
				error: `Server mengembalikan status ${res.status}.`,
			};
		}
		const body: unknown = await res.json().catch(() => null);
		if (!body || typeof body !== "object") {
			return {
				status: "unavailable",
				error: "Respons status generasi tidak valid.",
			};
		}
		const operations = normalizeOperationsMap(body);
		return { status: "available", operations };
	} catch (_err: unknown) {
		if (signal?.aborted) {
			return { status: "unavailable", error: "Dibatalkan." };
		}
		return {
			status: "unavailable",
			error: "Tidak dapat terhubung ke server status generasi.",
		};
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
			return {
				ok: false,
				operation: null,
				error: errorMsg,
				status: res.status,
			};
		}
		const op = parseOperation(body);
		if (!op) {
			return {
				ok: false,
				operation: null,
				error: "Format operasi dari server tidak valid.",
				status: 502,
			};
		}
		return { ok: true, operation: op, status: res.status };
	} catch (_err: unknown) {
		if (signal?.aborted) {
			return { ok: false, operation: null, status: 0, error: "Dibatalkan." };
		}
		// Ack-lost recovery: query with ?reconcile=1 and EXACT SAME payload!
		// DO NOT perform arbitrary lookups or execute a paid POST automatically.
		try {
			const reconcileRes = await fetch("/api/codebase/generation?reconcile=1", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal,
			});
			if (reconcileRes.ok) {
				const recBody: unknown = await reconcileRes.json().catch(() => null);
				const recOp = parseOperation(recBody);
				if (recOp) {
					return { ok: true, operation: recOp, status: 200, ackLost: true };
				}
			}
		} catch {
			// server genuinely unreachable
		}
		return {
			ok: false,
			operation: null,
			error:
				"Koneksi terputus saat mengirim permintaan. Periksa koneksi lalu coba lagi.",
			status: 0,
			ackLost: true,
		};
	}
}

const DEFAULT_POLL_INTERVAL_MS = process.env.NODE_ENV === "test" ? 15 : 1200;

export async function pollOperationUntilSettled({
	projectId,
	stage,
	operationId,
	signal,
	intervalMs = DEFAULT_POLL_INTERVAL_MS,
	maxAttempts,
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
	// When maxAttempts is omitted, keep monitoring true pending jobs without fake timeouts
	while (maxAttempts === undefined || attempts < maxAttempts) {
		if (signal?.aborted) return null;
		attempts++;

		try {
			let op: DurableGenerationOperation | null = null;
			if (operationId) {
				const res = await fetch(
					`/api/codebase/generation?projectId=${encodeURIComponent(projectId)}&operationId=${encodeURIComponent(operationId)}`,
					{ signal, headers: { Accept: "application/json" } },
				);
				if (res.ok) {
					const body: unknown = await res.json().catch(() => null);
					op = parseOperation(body);
					if (!op && body && typeof body === "object" && "operations" in body) {
						const opsMap = normalizeOperationsMap(body);
						op = opsMap[stage];
					}
				}
			} else {
				const fetchRes = await fetchGenerationOperations(projectId, signal);
				if (fetchRes.status === "available") {
					op = fetchRes.operations[stage];
				}
			}

			if (signal?.aborted) return null;

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
		} catch {
			// Transient network blip during polling: keep monitoring unless aborted
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return null;
}
