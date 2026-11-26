export interface StudioDevtoolsConfig {
	consolePiping: { enabled: boolean };
	injectSource: { enabled: boolean };
	removeDevtoolsOnBuild: boolean;
}

export const STUDIO_SOURCE_INSPECTOR_ENV =
	"VITE_ENABLE_STUDIO_SOURCE_INSPECTOR" as const;

/**
 * TanStack's source inspector injects `data-tsd-source` attributes into app
 * JSX. That is useful when debugging application source, but it is unrelated
 * to Pencil: Pencil edits generated frames inside their isolated document,
 * while the inspector points at this repository's own components. Keep the
 * injection off unless a developer explicitly opts in.
 */
export function resolveStudioDevtoolsConfig(
	env: Readonly<Record<string, string | undefined>>,
): StudioDevtoolsConfig {
	return {
		consolePiping: { enabled: false },
		injectSource: { enabled: env[STUDIO_SOURCE_INSPECTOR_ENV] === "1" },
		removeDevtoolsOnBuild: true,
	};
}
