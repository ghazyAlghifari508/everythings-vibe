"use client";

import { useMatches, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

type Artifact = "hasPrd" | "hasAc";

/**
 * The parent workspace snapshot feeds the navbar CTA; a child loader can land
 * a persisted artifact first. When the child holds it and the parent says it
 * does not, revalidate once per (project, artifact). Loaders are the source of
 * truth, so this converges without polling and without per-token invalidation.
 */
export function useWorkspaceSync(
	projectId: string | undefined,
	artifact: Artifact,
	childHasArtifact: boolean,
) {
	const router = useRouter();
	const parentHas = useMatches({
		select: (matches) => {
			const parent = matches.find((m) => m.routeId === "/vibeplan/$id");
			return parent?.loaderData?.[artifact];
		},
	});
	const requested = useRef<string | null>(null);
	useEffect(() => {
		if (!projectId || !childHasArtifact || parentHas !== false) return;
		const key = `${projectId}:${artifact}`;
		if (requested.current === key) return;
		requested.current = key;
		void router.invalidate();
	}, [projectId, artifact, childHasArtifact, parentHas, router]);
	useEffect(() => {
		if (parentHas === true) requested.current = null;
	}, [parentHas]);
}
