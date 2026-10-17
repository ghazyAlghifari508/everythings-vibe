"use client";

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
	type CodebaseAnalysis,
	inferTechAnswersFromCodebase,
} from "@/features/codebase/services/analysis";
import type { NonTechAnswer } from "@/features/greenfield/components/ask/question-card";
import {
	getAskLanguage,
	getAskPlatform,
	getAskState,
	getSetupPrompt,
	saveAskState,
} from "@/lib/prompt-handoff";

export interface AskQuestion {
	id: string;
	question: string;
	type: "select" | "text" | "multiselect";
	options?: string[];
}

export interface TechAnswers {
	frontend?: string;
	backend?: string;
	fullstackFramework?: string;
	database?: string;
	deployment?: string;
}

export interface AskHandoffState {
	projectId: string;
	answers?: Array<{ question: string; answer: string }>;
	compiledPrompt?: string;
	state?: {
		prompt?: string;
		platform?: "web" | "mobile";
		session?: 1 | 2 | 3;
		questions?: AskQuestion[];
		nonTechAnswers?: Record<string, NonTechAnswer>;
		techAnswers?: TechAnswers;
		skippedTech?: string[];
	};
}

interface UseAskSessionParams {
	projectId: string;
	projectName: string;
	analysis?: CodebaseAnalysis | null;
	initialHandoff?: AskHandoffState | null;
}

/**
 * Owns the Ask session state machine: question loading, local/server restore,
 * and the debounced autosave. Kept as one hook so the restore/autosave
 * ordering guarantees stay in a single place.
 */
export function useAskSession({
	projectId,
	projectName,
	analysis,
	initialHandoff,
}: UseAskSessionParams) {
	const navigate = useNavigate();
	const promptRef = useRef("");
	const hasFetched = useRef<string | null>(null);
	// Server restore must win over a stale local snapshot: autosave stays
	// off until the initial load settles, and submit cancels any autosave
	// still in flight so an older write cannot land after the final one.
	const restoreSettled = useRef(false);
	const autosaveCtrl = useRef<AbortController | null>(null);

	const [session, setSession] = useState<1 | 2>(1);
	const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
	const [loadError, setLoadError] = useState("");
	const [questions, setQuestions] = useState<AskQuestion[]>([]);
	const [nonTechAnswers, setNonTechAnswers] = useState<
		Record<string, NonTechAnswer>
	>({});
	const [techAnswers, setTechAnswers] = useState<TechAnswers>(() => {
		const savedFromHandoff = initialHandoff?.state?.techAnswers;
		if (savedFromHandoff && Object.keys(savedFromHandoff).length > 0) {
			return savedFromHandoff;
		}
		if (analysis) {
			return inferTechAnswersFromCodebase(analysis, "web");
		}
		return {};
	});
	const [skippedTech, setSkippedTech] = useState<Set<string>>(new Set());
	const [platform, setPlatform] = useState<"web" | "mobile">("web");

	const toggleSkipTech = (field: string) => {
		setSkippedTech((prev) => {
			const next = new Set(prev);
			if (next.has(field)) next.delete(field);
			else {
				next.add(field);
				setTechAnswers((p) => ({ ...p, [field]: undefined }));
			}
			return next;
		});
	};

	// ponytail: deps kosong disengaja. `useNavigate()` bikin objek baru tiap render,
	// kalau masuk dep array, effect re-run terus dan cleanup abort membunuh fetch
	// yang sedang jalan, sementara guard hasFetched memblokir fetch ulang → layar
	// "Gagal memuat pertanyaan." padahal tidak ada error. Fetch cukup sekali per
	// mount; hasFetched menjaga StrictMode double-invoke.
	// biome-ignore lint/correctness/useExhaustiveDependencies: lihat catatan di atas
	useEffect(() => {
		if (hasFetched.current === projectId) return;
		hasFetched.current = projectId;

		// Restore state persisted across refresh/hard-refresh. If a saved set
		// exists for THIS project, replay it and skip regenerating questions.
		const saved = getAskState(projectId);
		if (saved) {
			promptRef.current = saved.prompt;
			setPlatform(saved.platform);
			setSession(saved.session);
			setQuestions(saved.questions);
			setNonTechAnswers(saved.nonTechAnswers);
			const baseTech = analysis
				? inferTechAnswersFromCodebase(analysis, saved.platform)
				: {};
			setTechAnswers({ ...baseTech, ...(saved.techAnswers ?? {}) });
			setSkippedTech(new Set(saved.skippedTech ?? []));
			setIsLoadingQuestions(false);
			return;
		}

		// Helper to apply state snapshot from server
		const applyState = (st: unknown): boolean => {
			if (!st || typeof st !== "object") return false;
			const s = st as Record<string, unknown>;
			if (typeof s.prompt === "string" && s.prompt) {
				promptRef.current = s.prompt;
			}
			if (s.platform === "web" || s.platform === "mobile") {
				setPlatform(s.platform);
			}
			if (s.session === 1 || s.session === 2) {
				setSession(s.session);
			} else if (s.session === 3) {
				setSession(2);
			}
			if (s.nonTechAnswers && typeof s.nonTechAnswers === "object") {
				setNonTechAnswers(s.nonTechAnswers as Record<string, NonTechAnswer>);
			}
			const targetPlatform = (s.platform as "web" | "mobile") || platform;
			const baseTech = analysis
				? inferTechAnswersFromCodebase(analysis, targetPlatform)
				: {};
			if (s.techAnswers && typeof s.techAnswers === "object") {
				const t = s.techAnswers as Record<string, unknown>;
				setTechAnswers({
					...baseTech,
					...(typeof t.frontend === "string" ? { frontend: t.frontend } : {}),
					...(typeof t.backend === "string" ? { backend: t.backend } : {}),
					...(typeof t.fullstackFramework === "string"
						? { fullstackFramework: t.fullstackFramework }
						: {}),
					...(typeof t.database === "string" ? { database: t.database } : {}),
					...(typeof t.deployment === "string"
						? { deployment: t.deployment }
						: {}),
				});
			} else if (analysis) {
				setTechAnswers(baseTech);
			}
			if (Array.isArray(s.skippedTech)) {
				setSkippedTech(
					new Set(
						s.skippedTech.filter((x): x is string => typeof x === "string"),
					),
				);
			}
			if (Array.isArray(s.questions) && s.questions.length > 0) {
				const validTypes = ["select", "text", "multiselect"];
				const validQuestions = s.questions.filter((q): q is AskQuestion => {
					if (!q || typeof q !== "object") return false;
					const cand = q as Partial<AskQuestion>;
					if (
						typeof cand.id !== "string" ||
						typeof cand.question !== "string"
					) {
						return false;
					}
					if (!validTypes.includes(cand.type ?? "")) return false;
					if (cand.options !== undefined) {
						if (!Array.isArray(cand.options)) return false;
						if (!cand.options.every((o) => typeof o === "string")) return false;
					}
					return true;
				});
				if (validQuestions.length > 0) {
					setQuestions(validQuestions);
					setIsLoadingQuestions(false);
					return true;
				}
			}
			return false;
		};

		// Authoritative server handoff: survives tab close, History navigation,
		// and multi-device access where sessionStorage cannot.
		const restoreFromServer = async (): Promise<boolean> => {
			if (initialHandoff?.state) {
				if (applyState(initialHandoff.state)) return true;
			}
			try {
				const res = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId, action: "get-handoff" }),
				});
				if (!res.ok) return false;
				const data = (await res.json().catch(() => null)) as {
					handoff?: { state?: unknown } | null;
				};
				if (data?.handoff?.state) {
					return applyState(data.handoff.state);
				}
				return false;
			} catch {
				return false;
			}
		};

		const run = async () => {
			if (await restoreFromServer()) return;

			// Prompt fallback chain: promptRef (from server handoff) -> sessionStorage -> projectName
			const prompt = promptRef.current || getSetupPrompt() || projectName;
			if (!prompt) {
				navigate({ to: "/", replace: true });
				return;
			}
			promptRef.current = prompt;
			setPlatform(getAskPlatform());

			try {
				const res = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId,
						prompt,
						platform: getAskPlatform(),
						language: getAskLanguage(),
					}),
				});
				const data = (await res.json().catch(() => ({}))) as {
					questions?: AskQuestion[];
					error?: string;
				};
				if (!res.ok) throw new Error(data.error || "Gagal memuat pertanyaan");
				setQuestions(data.questions ?? []);
			} catch (err) {
				console.error("Fetch ask options error:", err);
				setLoadError(
					err instanceof Error ? err.message : "Gagal memuat pertanyaan",
				);
			} finally {
				setIsLoadingQuestions(false);
			}
		};
		void run().finally(() => {
			restoreSettled.current = true;
		});
	}, []);

	// Persist across refresh/hard-refresh: write state whenever it changes.
	// Only once questions exist, avoids persisting an empty placeholder.
	// Server writes wait for the initial restore so a stale local snapshot
	// can never overwrite newer server state on mount.
	useEffect(() => {
		if (questions.length === 0 || !promptRef.current) return;
		saveAskState({
			projectId,
			prompt: promptRef.current,
			platform,
			session,
			questions,
			nonTechAnswers,
			skippedTech: [...skippedTech],
			techAnswers,
		});
		if (!restoreSettled.current) return;

		// Debounced server auto-save so answers survive tab close & multi-device.
		// Each new change aborts the previous in-flight save: only the latest
		// snapshot may land.
		autosaveCtrl.current?.abort();
		const ctrl = new AbortController();
		autosaveCtrl.current = ctrl;
		const timer = setTimeout(() => {
			void fetch("/api/ask/options", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				signal: ctrl.signal,
				body: JSON.stringify({
					projectId,
					action: "save-handoff",
					handoff: {
						projectId,
						answers: [],
						state: {
							prompt: promptRef.current,
							platform,
							session,
							questions,
							nonTechAnswers,
							techAnswers,
							skippedTech: [...skippedTech],
						},
					},
				}),
			}).catch((err) => {
				if (err instanceof Error && err.name === "AbortError") return;
				console.error("Auto-save ask handoff failed:", err);
			});
		}, 600);

		return () => {
			clearTimeout(timer);
			ctrl.abort();
		};
	}, [
		questions,
		nonTechAnswers,
		techAnswers,
		skippedTech,
		session,
		platform,
		projectId,
	]);

	return {
		autosaveCtrl,
		isLoadingQuestions,
		loadError,
		nonTechAnswers,
		platform,
		promptRef,
		questions,
		session,
		setNonTechAnswers,
		setSession,
		setTechAnswers,
		skippedTech,
		techAnswers,
		toggleSkipTech,
	};
}
