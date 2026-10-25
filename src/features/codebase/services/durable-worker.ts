import { config } from "dotenv";
import type {
	DurableGenerationClaim,
	WorkspaceGenerationExecutor,
} from "../types/durable-generation";

export const WORKER_POLL_INTERVAL_MS = 2_000;
export const STALE_RECOVERY_INTERVAL_MS = 30_000;

export interface DurableWorkerConfig {
	workerId?: string;
	pollIntervalMs?: number;
	executor?: WorkspaceGenerationExecutor;
}

const defaultExecutor: WorkspaceGenerationExecutor = async (claim) => {
	const { executeWorkspaceGenerationStage } = await import(
		"./workspace-generation-executor.server"
	);
	return executeWorkspaceGenerationStage(claim);
};

export async function runDurableWorkerLoop(
	workerConfig: DurableWorkerConfig = {},
	stopSignal?: AbortSignal,
): Promise<void> {
	// Execute dotenv config before dynamically loading DB and server generation modules
	config({ path: [".env.local", ".env"] });

	const {
		claimNextGenerationOperation,
		executeGenerationOperationBounded,
		recoverStaleGenerationOperations,
	} = await import("./durable-generation.server");

	const workerId = workerConfig.workerId ?? `worker-${process.pid}`;
	const pollMs = workerConfig.pollIntervalMs ?? WORKER_POLL_INTERVAL_MS;
	const executor = workerConfig.executor ?? defaultExecutor;

	let lastRecovery = 0;

	while (!stopSignal?.aborted) {
		const now = Date.now();
		if (now - lastRecovery > STALE_RECOVERY_INTERVAL_MS) {
			lastRecovery = now;
			try {
				await recoverStaleGenerationOperations();
			} catch (err) {
				console.error("[DurableWorker] Stale recovery check failed:", err);
			}
		}

		let claim: DurableGenerationClaim | null = null;
		try {
			claim = await claimNextGenerationOperation(workerId);
		} catch (claimError) {
			console.error(
				"[DurableWorker] Error claiming next operation:",
				claimError,
			);
		}

		if (!claim) {
			if (stopSignal?.aborted) break;
			await new Promise<void>((resolve) => {
				const timer = setTimeout(resolve, pollMs);
				stopSignal?.addEventListener(
					"abort",
					() => {
						clearTimeout(timer);
						resolve();
					},
					{ once: true },
				);
			});
			continue;
		}

		try {
			console.info(
				`[DurableWorker ${workerId}] Processing operation ${claim.operationId} (stage: ${claim.stage}, attempt: ${claim.attempt})`,
			);
			const executionClaim: DurableGenerationClaim = {
				...claim,
				signal: stopSignal
					? AbortSignal.any([claim.signal, stopSignal])
					: claim.signal,
			};
			await executeGenerationOperationBounded(executionClaim, executor);
		} catch (execError) {
			console.error(
				`[DurableWorker ${workerId}] Failed processing operation ${claim.operationId}:`,
				execError,
			);
		}
	}
}

// Standalone execution entrypoint
if (
	typeof process !== "undefined" &&
	process.argv[1] &&
	process.argv[1].endsWith("durable-worker.ts")
) {
	const controller = new AbortController();
	process.on("SIGINT", () => controller.abort());
	process.on("SIGTERM", () => controller.abort());

	console.info("Durable Codebase Generation Worker started...");
	runDurableWorkerLoop({}, controller.signal)
		.then(() =>
			console.info("Durable Codebase Generation Worker stopped cleanly."),
		)
		.catch((err) => {
			console.error("Durable Codebase Generation Worker fatal error:", err);
			process.exit(1);
		});
}
