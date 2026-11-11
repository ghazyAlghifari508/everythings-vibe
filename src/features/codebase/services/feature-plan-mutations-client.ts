import { CODEBASE_NAME_MAX_ERROR, CODEBASE_NAME_MIN_ERROR } from "./library";

export interface FeaturePlanMutationResult {
	ok: boolean;
	error?: string;
	/** Server-authoritative renamed name, present after a successful rename. */
	name?: string;
	/** Server-authoritative archive tombstone, present after archive/unarchive. */
	archivedAt?: string | null;
}

/** Narrow a parsed mutation body to the authoritative fields the server returns. */
function readAuthoritative(body: unknown): {
	name?: string;
	archivedAt?: string | null;
} {
	if (typeof body !== "object" || body === null) return {};
	const out: { name?: string; archivedAt?: string | null } = {};
	if (
		"name" in body &&
		typeof (body as Record<string, unknown>).name === "string"
	) {
		out.name = (body as { name: string }).name;
	}
	if ("archivedAt" in body) {
		const value = (body as { archivedAt: unknown }).archivedAt;
		out.archivedAt = typeof value === "string" ? value : null;
	}
	return out;
}

function hasStringError(body: unknown): body is { error: string } {
	return (
		typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof (body as Record<string, unknown>).error === "string"
	);
}

function readError(body: unknown, fallback: string): string {
	if (hasStringError(body) && body.error.trim().length > 0) {
		return body.error;
	}
	return fallback;
}

function featureUrl(codebaseId: string, projectId: string): string {
	const base = "/api/codebases";
	return `${base}/${encodeURIComponent(codebaseId)}/features/${encodeURIComponent(projectId)}`;
}

/**
 * Browser boundary for the feature-plan switcher's management actions:
 * rename, archive/unarchive, and permanent delete one feature plan.
 *
 * Each call posts to the feature-scoped route, which re-validates tenant and
 * feature-under-repository ownership server-side. The client only surfaces a
 * success flag or a server-provided message; it never trusts a local
 * optimistic result as authoritative.
 */
export const featurePlanMutations = {
	async rename(
		codebaseId: string,
		projectId: string,
		name: string,
	): Promise<FeaturePlanMutationResult> {
		try {
			const response = await fetch(featureUrl(codebaseId, projectId), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				return {
					ok: false,
					error: readError(body, "Gagal mengganti nama fitur."),
				};
			}
			return { ok: true, ...readAuthoritative(body) };
		} catch {
			return { ok: false, error: "Server tidak dapat dihubungi." };
		}
	},

	async setArchived(
		codebaseId: string,
		projectId: string,
		archived: boolean,
	): Promise<FeaturePlanMutationResult> {
		try {
			const response = await fetch(featureUrl(codebaseId, projectId), {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ archived }),
			});
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				return {
					ok: false,
					error: readError(
						body,
						archived
							? "Gagal mengarsipkan fitur."
							: "Gagal membatalkan arsip fitur.",
					),
				};
			}
			return { ok: true, ...readAuthoritative(body) };
		} catch {
			return { ok: false, error: "Server tidak dapat dihubungi." };
		}
	},

	async delete(
		codebaseId: string,
		projectId: string,
	): Promise<FeaturePlanMutationResult> {
		try {
			const response = await fetch(featureUrl(codebaseId, projectId), {
				method: "DELETE",
			});
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				return {
					ok: false,
					error: readError(body, "Gagal menghapus fitur."),
				};
			}
			return { ok: true };
		} catch {
			return { ok: false, error: "Server tidak dapat dihubungi." };
		}
	},
};

export {
	CODEBASE_NAME_MAX_ERROR as FEATURE_NAME_MAX_ERROR,
	CODEBASE_NAME_MIN_ERROR as FEATURE_NAME_MIN_ERROR,
};
