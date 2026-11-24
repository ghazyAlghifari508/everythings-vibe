import { useCallback, useMemo, useState } from "react";
import { planStudioLiveSurfaces } from "../utils/studio-renderer";

interface PoolFrame {
	id: string;
	htmlCode: string | null;
}

export type StudioVisibilityReporter = (
	id: string,
	intersects: boolean,
	region?: "visible" | "prewarm",
) => void;

export function useStudioLivePool({
	frames,
	selectedFrameId,
	inspectFrameId,
	inspectMode = false,
}: {
	frames: readonly PoolFrame[];
	selectedFrameId: string | null;
	inspectFrameId: string | null;
	inspectMode?: boolean;
}) {
	const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());
	const [prewarm, setPrewarm] = useState<ReadonlySet<string>>(() => new Set());
	const selected = useMemo(
		() => (selectedFrameId ? [selectedFrameId] : []),
		[selectedFrameId],
	);
	const eligible = useMemo(
		() =>
			new Set(
				frames.filter((frame) => frame.htmlCode).map((frame) => frame.id),
			),
		[frames],
	);
	const pinned = useMemo(
		() => new Set(inspectFrameId ? [inspectFrameId] : []),
		[inspectFrameId],
	);
	const pool = useMemo(
		() =>
			planStudioLiveSurfaces({
				selected,
				eligible,
				visible,
				prewarm,
				pinned,
				inspectMode,
			}),
		[selected, eligible, visible, prewarm, pinned, inspectMode],
	);
	const reportVisibility = useCallback<StudioVisibilityReporter>(
		(id, intersects, region = "visible") => {
			const setRegion = region === "visible" ? setVisible : setPrewarm;
			setRegion((previous) => {
				if (previous.has(id) === intersects) return previous;
				const copy = new Set(previous);
				if (intersects) copy.add(id);
				else copy.delete(id);
				return copy;
			});
		},
		[],
	);
	return { pool, reportVisibility };
}
