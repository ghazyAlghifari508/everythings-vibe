export const HOME_PROJECT_MODE_OPTIONS = [
	{ id: "greenfield", label: "Produk baru" },
	{ id: "existing_codebase", label: "Codebase existing" },
] as const;

export type HomeProjectMode = (typeof HOME_PROJECT_MODE_OPTIONS)[number]["id"];

export const GREENFIELD_PLACEHOLDER_ID =
	"Deskripsikan ide produk Anda — target pengguna, fitur utama, dan alur kerja yang diinginkan...";
export const GREENFIELD_PLACEHOLDER_EN =
	"Describe your product idea — target users, key features, and the desired workflow...";

export type HomePostCreationTarget =
	| { to: "/ask/$id"; params: { id: string } }
	| { to: "/codebases/$id"; params: { id: string } };

/**
 * Post-creation routing: existing-codebase enters its sync connect screen,
 * everything else (including legacy responses without a mode) keeps the /ask/$id route.
 */
export function decideHomePostCreationTarget(project: {
	id: string;
	projectMode?: string | null;
}): HomePostCreationTarget {
	if (project.projectMode === "existing_codebase") {
		return { to: "/codebases/$id", params: { id: project.id } };
	}
	return { to: "/ask/$id", params: { id: project.id } };
}

/**
 * Credit precheck gate: block only on a known-zero balance. Unknown or
 * unlimited balances fail open here — the server still enforces with 403 at
 * generate time.
 */
export function shouldBlockProjectCreationOnCredits(
	remaining: number | "unlimited" | null | undefined,
): boolean {
	return remaining === 0;
}

export interface ChatInputProps {
	className?: string;
	initialValue?: string;
	initialMobile?: boolean;
	prefillKey?: number;
	onModeChange?: (mode: HomeProjectMode) => void;
	hideModeSelector?: boolean;
}
