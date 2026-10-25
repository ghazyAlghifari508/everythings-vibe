export type SaveHandoffResult =
	| boolean
	| { ok: boolean; status?: number; code?: string; error?: string };

export type GenerateFeatureResult = {
	status: number;
	error?: string;
	code?: string;
};

export interface ConfirmGenerateDeps {
	/** Persist the Ask handoff; resolves true only when the server confirmed. */
	saveHandoff: () => Promise<SaveHandoffResult>;
	generateFeature: () => Promise<GenerateFeatureResult>;
	/** Reload the authoritative feature tree; null when it is not persisted. */
	reloadFeatureTree: () => Promise<unknown | null>;
	/** Optional check if feature tree is already persisted before generating */
	checkExistingFeatureTree?: () => Promise<unknown | null>;
}

export type ConfirmGenerateOutcome =
	| { kind: "handoff_failed"; status?: number; code?: string; error?: string }
	| { kind: "spec_failed"; status?: number; code?: string; error?: string }
	| { kind: "generating" }
	| { kind: "not_persisted" }
	| { kind: "success" };

/**
 * Orchestrate Feature Specification generation with generation gated on real
 * persistence:
 *  - the Feature generator never runs when the Ask handoff was not saved;
 *  - a 200 response alone is not treated as success — the feature tree must be
 *    reloadable from the authoritative server state before the stage advances.
 */
export async function runConfirmGenerate(
	deps: ConfirmGenerateDeps,
): Promise<ConfirmGenerateOutcome> {
	if (deps.checkExistingFeatureTree) {
		const existing = await deps.checkExistingFeatureTree();
		if (existing) return { kind: "success" };
	}

	const saveOutcome = await deps.saveHandoff();
	const isSaved =
		typeof saveOutcome === "boolean" ? saveOutcome : saveOutcome.ok;
	if (!isSaved) {
		const details = typeof saveOutcome === "object" ? saveOutcome : undefined;
		return {
			kind: "handoff_failed",
			...(details?.status ? { status: details.status } : {}),
			...(details?.code ? { code: details.code } : {}),
			...(details?.error ? { error: details.error } : {}),
		};
	}

	const response = await deps.generateFeature();
	if (response.status === 409) return { kind: "generating" };
	if (response.status < 200 || response.status >= 300) {
		return {
			kind: "spec_failed",
			...(response.status ? { status: response.status } : {}),
			...(response.code ? { code: response.code } : {}),
			...(response.error ? { error: response.error } : {}),
		};
	}

	const persisted = await deps.reloadFeatureTree();
	if (!persisted) return { kind: "not_persisted" };
	return { kind: "success" };
}
