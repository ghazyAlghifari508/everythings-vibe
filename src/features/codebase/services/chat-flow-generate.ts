export interface ConfirmGenerateDeps {
	/** Persist the Ask handoff; resolves true only when the server confirmed. */
	saveHandoff: () => Promise<boolean>;
	generateFeature: () => Promise<{ status: number }>;
	/** Reload the authoritative feature tree; null when it is not persisted. */
	reloadFeatureTree: () => Promise<unknown | null>;
}

export type ConfirmGenerateOutcome =
	| { kind: "handoff_failed" }
	| { kind: "spec_failed" }
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
	const saved = await deps.saveHandoff();
	if (!saved) return { kind: "handoff_failed" };

	const response = await deps.generateFeature();
	if (response.status === 409) return { kind: "generating" };
	if (response.status < 200 || response.status >= 300)
		return { kind: "spec_failed" };

	const persisted = await deps.reloadFeatureTree();
	if (!persisted) return { kind: "not_persisted" };
	return { kind: "success" };
}
