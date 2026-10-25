import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useUserPlan } from "@/features/billing/hooks/use-user-plan";
import {
	getPendingSyncPayloadKey,
	syncPromptPayloadSchema,
} from "@/features/codebase/services/sync";
import { HOME_DRAFT_DEBOUNCE_MS } from "@/features/greenfield/types/greenfield-constants";
import { authClient } from "@/lib/auth-client";
import { MAX_PROMPT_LENGTH, MIN_PROMPT_LENGTH } from "@/lib/constants";
import type { OutputLanguage } from "@/lib/language";
import {
	clearHomeDraft,
	getAskLanguage,
	getHomeDraft,
	saveAskLanguage,
	saveAskPlatform,
	saveHomeDraft,
	saveSetupPrompt,
} from "@/lib/prompt-handoff";
import {
	type ChatInputProps,
	decideHomePostCreationTarget,
	type HomeProjectMode,
	shouldBlockProjectCreationOnCredits,
} from "./chat-input-routing";

export function useHomeProjectCreation({
	initialValue,
	initialMobile,
	prefillKey,
	onModeChange,
}: Pick<
	ChatInputProps,
	"initialValue" | "initialMobile" | "prefillKey" | "onModeChange"
> = {}) {
	const [message, setMessage] = useState(() => getHomeDraft());
	const [focused, setFocused] = useState(false);
	const [isMobileMode, setIsMobileMode] = useState(false);
	const [projectMode, setProjectMode] = useState<HomeProjectMode>("greenfield");
	const [language, setLanguage] = useState<OutputLanguage>(() =>
		getAskLanguage(),
	);
	const [promptError, setPromptError] = useState("");
	const [creditsExhaustedMsg, setCreditsExhaustedMsg] = useState<string | null>(
		null,
	);
	const [isSending, setIsSending] = useState(false);
	const isSendingRef = useRef(false);

	// ponytail: shared TanStack Query hook — deduped across all components
	// that read /api/user/plan. 60s staleTime. Replaces manual fetch() calls.
	const { data: planData, refetch: refetchPlan } = useUserPlan();
	// ponytail: reactive shared session via nanostore — deduped with Navbar.
	const { data: session } = authClient.useSession();

	const navigate = useNavigate();

	useEffect(() => {
		if (initialValue !== undefined || prefillKey !== undefined) {
			setMessage(initialValue ?? "");
			if (initialMobile !== undefined) setIsMobileMode(initialMobile);
		}
	}, [initialValue, initialMobile, prefillKey]);

	// ponytail: debounce keeps the home seed-prompt draft alive across
	// refresh, so a long product description isn't lost before send.
	useEffect(() => {
		const t = setTimeout(() => saveHomeDraft(message), HOME_DRAFT_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [message]);

	const handleModeChange = (mode: HomeProjectMode) => {
		if (mode !== projectMode) {
			setProjectMode(mode);
			setMessage("");
			clearHomeDraft();
			setPromptError("");
			onModeChange?.(mode);
		}
	};

	const handleLanguageChange = (nextLanguage: OutputLanguage) => {
		setLanguage(nextLanguage);
		saveAskLanguage(nextLanguage);
	};

	const handleSend = async () => {
		if (isSendingRef.current || !message.trim()) return;

		const trimmed = message.trim();
		if (trimmed.length < MIN_PROMPT_LENGTH) {
			setPromptError(
				`Deskripsikan produkmu lebih detail (minimal ${MIN_PROMPT_LENGTH} karakter) agar AI bisa menghasilkan PRD yang berkualitas.`,
			);
			return;
		}
		if (trimmed.length > MAX_PROMPT_LENGTH) {
			setPromptError(
				`Deskripsi produkmu terlalu panjang (maksimal ${MAX_PROMPT_LENGTH.toLocaleString("id-ID")} karakter).`,
			);
			return;
		}
		setPromptError("");

		isSendingRef.current = true;
		setIsSending(true);

		try {
			// Store model & platform preference alongside the prompt
			const originalMessage = trimmed;
			const enrichedPrompt =
				projectMode === "existing_codebase"
					? originalMessage
					: isMobileMode
						? `[Platform: Mobile App]\n${originalMessage}`
						: `[Platform: Web App]\n${originalMessage}`;

			try {
				saveSetupPrompt(enrichedPrompt);
				if (projectMode !== "existing_codebase") {
					saveAskPlatform(isMobileMode ? "mobile" : "web");
				}
				saveAskLanguage(language);
			} catch (storageErr) {
				console.warn("Failed to stash prompt in storage:", storageErr);
			}

			// ponytail: use reactive session (shared nanostore with Navbar) instead
			// of a manual getSession() round-trip per send attempt.
			const isAuthenticated = !!session?.user?.id;

			if (!isAuthenticated) {
				// ponytail: back to home, not /ask, the project doesn't exist yet at this
				// point, so there is no /ask/$id to land on and no bare /ask route.
				navigate({ to: "/login", search: { redirect: "/" } });
				return;
			}

			// Pre-check credits before creating project — blocks at home page,
			// not after redirect to empty PRD/question page.
			try {
				const freshPlan = await refetchPlan();
				if (shouldBlockProjectCreationOnCredits(freshPlan.data?.remaining)) {
					setCreditsExhaustedMsg(
						"Kredit kamu sudah habis. Beli kredit untuk membuat proyek baru.",
					);
					return;
				}
			} catch {
				// If plan check fails, allow flow — server will block with 403 anyway
			}

			const endpoint =
				projectMode === "existing_codebase"
					? "/api/codebases"
					: "/api/projects";
			const requestBody =
				projectMode === "existing_codebase"
					? { message: enrichedPrompt }
					: {
							message: enrichedPrompt,
							language,
							projectMode,
							platform: isMobileMode ? "mobile" : "web",
						};
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody),
			});
			const body: unknown = await res.json().catch(() => null);
			if (!res.ok || typeof body !== "object" || body === null) {
				const message =
					typeof body === "object" &&
					body !== null &&
					"error" in body &&
					typeof body.error === "string"
						? body.error
						: "Gagal membuat proyek";
				if (res.status === 403) {
					setCreditsExhaustedMsg(message);
					return;
				}
				throw new Error(message);
			}
			if (!("id" in body) || typeof body.id !== "string")
				throw new Error("Respons pembuatan proyek tidak valid");
			const responseProjectMode =
				"projectMode" in body && typeof body.projectMode === "string"
					? body.projectMode
					: null;
			const syncPayload =
				"sync" in body ? syncPromptPayloadSchema.safeParse(body.sync) : null;
			clearHomeDraft();
			// Existing-codebase enters the sync flow: stash the one-time sync
			// payload for /codebases/$id (consumed once to open the agent
			// modal). Greenfield keeps the exact /ask/$id navigation.
			const target = decideHomePostCreationTarget({
				id: body.id,
				projectMode: responseProjectMode ?? projectMode,
			});
			if (target.to === "/codebases/$id") {
				if (!syncPayload?.success)
					throw new Error("Respons sync codebase tidak valid");
				try {
					sessionStorage.setItem(
						getPendingSyncPayloadKey(body.id),
						JSON.stringify(syncPayload.data),
					);
				} catch {
					// Storage blocked/full — the codebase page falls back to
					// manual "Mulai sync", so creation still succeeds.
				}
			}
			navigate({ to: target.to, params: target.params });
		} catch (err) {
			console.error("Create project error:", err);
			setPromptError("Gagal membuat proyek. Coba lagi.");
		} finally {
			isSendingRef.current = false;
			setIsSending(false);
		}
	};

	return {
		message,
		setMessage,
		focused,
		setFocused,
		isMobileMode,
		setIsMobileMode,
		projectMode,
		language,
		promptError,
		creditsExhaustedMsg,
		setCreditsExhaustedMsg,
		isSending,
		planData,
		handleModeChange,
		handleLanguageChange,
		handleSend,
	};
}
