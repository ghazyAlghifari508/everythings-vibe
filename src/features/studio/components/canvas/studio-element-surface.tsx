import { Spinner } from "@/components/ui/spinner";
import { useStudioLiveDocument } from "../../hooks/use-studio-live-document";
import type { StudioElementTarget } from "../../types/studio-element";
import {
	STUDIO_DEVICE_PRESETS,
	type StudioDevice,
} from "../../types/studio-renderer";
import { StudioLiveSurface } from "./studio-live-surface";

/**
 * Standalone live surface for revision-history comparison. It renders a stored
 * snapshot through the same renderer as the canvas, so before/after and the
 * frame can never disagree on styles or bridge behavior.
 */
export function StudioElementSurface({
	projectId,
	frameId,
	baseRevision,
	name,
	target,
	onSelect,
	revisionId,
	side,
	suspended = false,
	device = "desktop",
}: {
	projectId: string;
	frameId: string;
	baseRevision: number;
	name: string;
	target?: StudioElementTarget | null;
	onSelect?: (target: StudioElementTarget | null) => void;
	revisionId?: string;
	side?: "before" | "after";
	suspended?: boolean;
	device?: StudioDevice;
}) {
	const preset = STUDIO_DEVICE_PRESETS[device];
	const { state, dispatch, readiness, retry } = useStudioLiveDocument({
		projectId,
		frameId,
		revision: baseRevision,
		html: null,
		enabled: true,
		revisionId,
		side,
	});
	const label = onSelect
		? "Pilih elemen"
		: side === "before"
			? "Sebelum revisi"
			: "Setelah revisi";
	return (
		<div className="relative size-full overflow-hidden bg-white">
			<StudioLiveSurface
				state={state}
				dispatch={dispatch}
				title={`${label}: ${name}`}
				width={preset.width}
				height={
					readiness.phase === "ready"
						? Math.max(preset.height, readiness.scrollHeight)
						: preset.height
				}
				visible={readiness.phase === "ready"}
				interactive
				suspended={suspended}
				target={target}
				onSelect={onSelect}
			/>
			{readiness.phase === "failed" ? (
				<div
					role="alert"
					className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-obsidian p-4 text-sm text-snow"
				>
					<p>{readiness.message}</p>
					<button
						type="button"
						className="min-h-11 rounded-md border border-graphite px-3 focus-visible:outline-2 focus-visible:outline-snow"
						onClick={retry}
					>
						Muat ulang inspeksi
					</button>
				</div>
			) : readiness.phase !== "ready" ? (
				<output className="absolute inset-0 flex items-center justify-center gap-2 bg-obsidian text-sm text-fog">
					<Spinner size={18} />
					Menyiapkan HTML terisolasi
				</output>
			) : null}
		</div>
	);
}
