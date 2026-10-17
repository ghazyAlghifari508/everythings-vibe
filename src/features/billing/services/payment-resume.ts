import { getSessionStorage, isPlausibleTimestamp } from "@/lib/session-storage";

const RESUME_INTENT_KEY = "prdfy:resume-intent";
const RESUME_INTENT_MAX_AGE_MS = 15 * 60 * 1000;

interface ResumeIntentPayload {
	projectId: string;
	stage: "prd" | "ac" | "task";
	createdAt: number;
}

export function saveResumeIntent(
	projectId: string,
	stage: "prd" | "ac" | "task",
) {
	const payload: ResumeIntentPayload = {
		projectId,
		stage,
		createdAt: Date.now(),
	};
	getSessionStorage()?.setItem(RESUME_INTENT_KEY, JSON.stringify(payload));
}

export function consumeResumeIntent(
	projectId: string,
): "prd" | "ac" | "task" | null {
	const storage = getSessionStorage();
	const raw = storage?.getItem(RESUME_INTENT_KEY);
	if (!raw) return null;
	storage?.removeItem(RESUME_INTENT_KEY);
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		if (!("projectId" in parsed) || typeof parsed.projectId !== "string")
			return null;
		if (
			!("stage" in parsed) ||
			(parsed.stage !== "prd" &&
				parsed.stage !== "ac" &&
				parsed.stage !== "task")
		)
			return null;
		if (!("createdAt" in parsed) || !isPlausibleTimestamp(parsed.createdAt))
			return null;
		if (!parsed.projectId || parsed.projectId !== projectId) return null;
		if (Date.now() - parsed.createdAt > RESUME_INTENT_MAX_AGE_MS) return null;
		return parsed.stage;
	} catch {
		return null;
	}
}
