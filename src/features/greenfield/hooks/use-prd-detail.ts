"use client";

import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GENERATION_STATUS_POLL_INTERVAL_MS } from "@/features/greenfield/types/greenfield-constants";
import { getPendingPrdPrompt } from "@/lib/prompt-handoff";
import { useChatStore, useUIStore } from "@/store";
import type { PrdVersion } from "@/types/database";

interface UsePrdDetailParams {
	projectId?: string;
	latestVersion?: PrdVersion;
	allVersions: PrdVersion[];
	initialMessages: Array<{
		id: string;
		role: string;
		content: string;
		created_at: string;
	}>;
	search: unknown;
}

/**
 * Owns PRD detail state: version selection, typewriter reveal, store sync,
 * return-recovery polling, and the paywall deep-link.
 */
export function usePrdDetail({
	projectId,
	latestVersion,
	allVersions,
	initialMessages,
	search,
}: UsePrdDetailParams) {
	const router = useRouter();
	const openPaywallModal = useUIStore((s) => s.openPaywallModal);
	const [currentContent, setCurrentContent] = useState(
		latestVersion?.content || "",
	);
	const [selectedVersionNum, setSelectedVersionNum] = useState(
		latestVersion?.version || 1,
	);
	// ponytail: versions list must be client-refreshable after revision - server-rendered
	// allVersions stays stale until next page load. Track locally so version history
	// appears immediately after revision without requiring a full page refresh.
	const [versions, setVersions] = useState(allVersions);

	const {
		isGeneratingPRD,
		streamingPRDContent,
		setGeneratingPRD,
		setStreamingPRDContent,
		setMessages,
	} = useChatStore();

	// ── Typewriter reveal (generation only) ──
	// ponytail: 9router reasoning models emit no deltas during their long thinking
	// phase, then burst the whole document in <2s — PrdViewer renders it
	// "instantly", so the typing animation never appears. Reveal the received PRD
	// progressively (~50 chars/25ms) while generating so it looks like the AI is
	// typing. Cosmetic only: the underlying streamingPRDContent/currentContent
	// stays whole, so the saved document is never truncated.
	const [revealChars, setRevealChars] = useState<number | null>(null);
	const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!isGeneratingPRD) {
			setRevealChars(null);
			if (revealTimer.current) clearTimeout(revealTimer.current);
			return;
		}
		setRevealChars(0);
		const tick = () => {
			// Cap to content that has actually arrived. Reasoning models sit
			// silent for 15-90s before bursting the whole PRD at once — without
			// this cap the ticker keeps counting up during that silent phase
			// (2000 chars/sec x tens of seconds = tens of thousands of "revealed"
			// chars against zero real content), so the moment the burst lands,
			// revealChars is already past its length and the whole document
			// snaps in instead of typing out from section 1.
			const liveLen = useChatStore.getState().streamingPRDContent.length;
			setRevealChars((prev) =>
				prev === null ? null : Math.min(prev + 50, liveLen),
			);
			revealTimer.current = setTimeout(tick, 25);
		};
		revealTimer.current = setTimeout(tick, 25);
		return () => {
			if (revealTimer.current) clearTimeout(revealTimer.current);
		};
	}, [isGeneratingPRD]);

	const streamingForView = useMemo(() => {
		if (!streamingPRDContent) return streamingPRDContent;
		if (revealChars === null || revealChars >= streamingPRDContent.length)
			return streamingPRDContent;
		return streamingPRDContent.slice(0, revealChars);
	}, [streamingPRDContent, revealChars]);

	// ── Effects ──

	// Sync chat messages - always set messages when initialMessages change
	// (survives refresh by loading from DB server-side).
	useEffect(() => {
		const store = useChatStore.getState();
		const isDifferentProject = store.activeProjectId !== (projectId || null);
		if (isDifferentProject) {
			store.setActiveProject(projectId || null);
		}
		if (initialMessages && initialMessages.length > 0) {
			setMessages(
				initialMessages.map((m) => ({
					id: m.id,
					role: m.role as "user" | "assistant" | "system",
					content: m.content,
					timestamp: new Date(m.created_at).getTime(),
				})),
			);
		} else if (isDifferentProject) {
			setMessages([]);
		}
	}, [projectId, initialMessages, setMessages]);

	// Sync content when latestVersion updates
	useEffect(() => {
		if (latestVersion) setCurrentContent(latestVersion.content);
	}, [latestVersion]);
	// Return recovery: a loader that missed the save lands with global
	// generating flags but no streamed bytes. Revalidate once; when the
	// saved version arrives, latestVersion paints the PRD and the effect
	// above clears the generating flags — no manual refresh.
	useEffect(() => {
		if (latestVersion?.content || streamingPRDContent || !isGeneratingPRD)
			return;
		let cancelled = false;
		const timer = setInterval(() => {
			if (cancelled) return;
			void router.invalidate();
		}, GENERATION_STATUS_POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [latestVersion, streamingPRDContent, isGeneratingPRD, router]);

	// Clear streaming state when mounted with saved PRD, and when navigating
	// between projects so stale Zustand globals from a prior streaming session
	// don't render a false generation state.
	useEffect(() => {
		const store = useChatStore.getState();
		const isDifferentProject = projectId && store.activeProjectId !== projectId;
		if (latestVersion?.content) {
			setGeneratingPRD(false);
			setStreamingPRDContent("");
		} else if (isDifferentProject) {
			setStreamingPRDContent("");
			if (!getPendingPrdPrompt()) {
				setGeneratingPRD(false);
			}
		} else if (!projectId) {
			setGeneratingPRD(false);
			setStreamingPRDContent("");
		}
	}, [projectId, latestVersion, setGeneratingPRD, setStreamingPRDContent]);

	// Open paywall modal if redirected from downstream route with ?paywall=ac
	useEffect(() => {
		const paywall =
			typeof search === "object" &&
			search !== null &&
			"paywall" in search &&
			typeof search.paywall === "string"
				? search.paywall
				: undefined;
		if (paywall === "ac") {
			openPaywallModal("ac");
		}
	}, [search, openPaywallModal]);

	// ── Handlers ──

	// ponytail: re-fetch versions list client-side so version history updates
	// immediately after revision without full page refresh
	const refreshVersions = useCallback(async (): Promise<PrdVersion[]> => {
		if (!projectId) return [];
		try {
			const res = await fetch(`/api/projects/${projectId}/versions`);
			if (res.ok) {
				const data = await res.json();
				setVersions(data);
				return data;
			}
		} catch (err) {
			console.error("Failed to refresh versions:", err);
		}
		return [];
	}, [projectId]);

	const handleVersionSelect = useCallback(
		(content: string, version: number) => {
			setCurrentContent(content);
			setSelectedVersionNum(version);
		},
		[],
	);

	// ponytail: after revision completes, update content, refresh versions list,
	// and jump selectedVersionNum to the new version - otherwise the Version
	// History label stays pinned to whatever version was current on page load.
	const handlePrdRevised = useCallback(
		async (content: string) => {
			setCurrentContent(content);
			const refreshed = await refreshVersions();
			if (refreshed.length > 0) {
				setSelectedVersionNum(Math.max(...refreshed.map((v) => v.version)));
			}
		},
		[refreshVersions],
	);

	// ponytail: stable identity so PrdViewer's memo isn't defeated by a fresh
	// array on every parent render (e.g. during chat-panel width dragging).
	const mappedVersions = useMemo(
		() =>
			versions?.map((v) => ({
				id: v.id,
				version: v.version,
				content: v.content,
				change_summary: v.change_summary,
				created_at: v.created_at,
			})),
		[versions],
	);

	return {
		currentContent,
		handlePrdRevised,
		handleVersionSelect,
		mappedVersions,
		selectedVersionNum,
		setCurrentContent,
		setSelectedVersionNum,
		streamingForView,
	};
}
