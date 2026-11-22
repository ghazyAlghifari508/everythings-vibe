import { useCallback, useMemo, useState } from "react";
import { planStudioLiveSurfaces } from "../utils/studio-renderer";

interface PoolFrame {
	id: string;
	htmlCode: string | null;
	status: string;
}

/**
 * Bounded pool of frames that keep a live document mounted. Selected frames
 * prewarm; frames reported off-screen by their artboard are released so a
 * project with many screens never holds dozens of iframes.
 */
export function useStudioLivePool({
	frames,
	selectedFrameId,
	selectedFrameIds,
	inspectFrameId,
}: {
	frames: readonly PoolFrame[];
	selectedFrameId: string | null;
	selectedFrameIds: readonly string[];
	inspectFrameId: string | null;
}) {
	const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
	const [pool, setPool] = useState<readonly string[]>([]);
	const selected = useMemo(
		() =>
			selectedFrameId
				? [selectedFrameId]
				: selectedFrameIds.length === 1
					? [...selectedFrameIds]
					: [],
		[selectedFrameId, selectedFrameIds],
	);
	const eligible = useMemo(
		() =>
			new Set(
				frames
					.filter((frame) => frame.htmlCode && frame.status === "ready")
					.map((frame) => frame.id),
			),
		[frames],
	);
	const pinned = useMemo(
		() => new Set(inspectFrameId ? [inspectFrameId] : []),
		[inspectFrameId],
	);
	const next = useMemo(
		() =>
			planStudioLiveSurfaces({
				previous: pool,
				selected,
				eligible,
				hidden,
				pinned,
			}),
		[pool, selected, eligible, hidden, pinned],
	);
	if (next.length !== pool.length || next.some((id, i) => id !== pool[i]))
		setPool(next);
	const reportVisibility = useCallback((id: string, visible: boolean) => {
		setHidden((previous) => {
			if (previous.has(id) === !visible) return previous;
			const copy = new Set(previous);
			if (visible) copy.delete(id);
			else copy.add(id);
			return copy;
		});
	}, []);
	return { pool: next, reportVisibility };
}
