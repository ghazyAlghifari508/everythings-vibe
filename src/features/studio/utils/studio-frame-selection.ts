/**
 * Composer targets are frame ids, but a frame row can disappear while its id is
 * still selected: planning replaces its slots, and its temporary ids never come
 * back. The operation endpoint refuses a revision whose target set names a frame
 * it cannot find (`STUDIO_INVALID_INPUT`), so a stale id used to reject every
 * selected-frame request while the composer showed no chip for it — the user had
 * nothing left to remove.
 *
 * Pruning keeps the visible targets and the stored selection in step. The
 * original array is returned when nothing was dropped, so a status poll that
 * merely re-reads the same rows never re-renders the composer.
 */
export function pruneStudioFrameSelection(
	selectedIds: string[],
	liveFrameIds: readonly string[],
): string[] {
	if (selectedIds.length === 0) return selectedIds;
	const live = new Set(liveFrameIds);
	const kept = selectedIds.filter((id) => live.has(id));
	return kept.length === selectedIds.length ? selectedIds : kept;
}
