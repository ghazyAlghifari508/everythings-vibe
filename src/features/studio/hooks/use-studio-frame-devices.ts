import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	readStudioFrameDevices,
	studioFrameDeviceStorageKey,
	writeStudioFrameDevices,
} from "../services/studio-frame-devices";
import type { StudioDevice } from "../types/studio-renderer";

interface UseStudioFrameDevicesInput {
	userId: string;
	projectId: string;
	frameIds: readonly string[];
}

/**
 * Keeps viewport preference per frame for the current workspace session. A
 * device click changes only this map; P6 resolves the real iframe width from it
 * without touching HTML, revisions, jobs or credits.
 */
export function useStudioFrameDevices({
	userId,
	projectId,
	frameIds,
}: UseStudioFrameDevicesInput): {
	frameDevices: Readonly<Record<string, StudioDevice>>;
	setFrameDevice: (frameId: string, device: StudioDevice) => void;
} {
	const key = studioFrameDeviceStorageKey(userId, projectId);
	const frameIdsKey = frameIds.join("|");
	const frameIdsRef = useRef(frameIds);
	frameIdsRef.current = frameIds;
	// biome-ignore lint/correctness/useExhaustiveDependencies: frameIdsKey is the stable identity of frameIds
	const validIds = useMemo(() => new Set(frameIds), [frameIdsKey]);
	const [frameDevices, setFrameDevices] = useState<
		Readonly<Record<string, StudioDevice>>
	>(() => readStudioFrameDevices(key, frameIdsRef.current));
	const [loadedKey, setLoadedKey] = useState(key);

	// A different workspace owns a different session bucket. Load before any
	// write so the previous project's map can never leak into the new one.
	useEffect(() => {
		setFrameDevices(readStudioFrameDevices(key, frameIdsRef.current));
		setLoadedKey(key);
	}, [key]);

	// Deleted frames leave no stale preference behind; existing choices survive
	// polling because only removed ids are dropped.
	useEffect(() => {
		setFrameDevices((previous) => {
			const entries = Object.entries(previous).filter(([id]) =>
				validIds.has(id),
			);
			return entries.length === Object.keys(previous).length
				? previous
				: Object.fromEntries(entries);
		});
	}, [validIds]);

	useEffect(() => {
		if (loadedKey !== key) return;
		writeStudioFrameDevices(key, frameDevices);
	}, [frameDevices, key, loadedKey]);

	const setFrameDevice = useCallback(
		(frameId: string, device: StudioDevice) => {
			setFrameDevices((previous) =>
				previous[frameId] === device
					? previous
					: { ...previous, [frameId]: device },
			);
		},
		[],
	);

	return { frameDevices, setFrameDevice };
}
