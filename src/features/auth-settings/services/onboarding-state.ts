import { getSessionStorage } from "@/lib/session-storage";

const ONBOARDING_STATE_KEY = "prdfy:onboarding-state";
const ONBOARDING_TOTAL_STEPS = 3;

export interface OnboardingState {
	step: number;
	fullName: string;
	role: string;
	goals: string[];
}

export function saveOnboardingState(state: OnboardingState) {
	getSessionStorage()?.setItem(ONBOARDING_STATE_KEY, JSON.stringify(state));
}

export function getOnboardingState(): OnboardingState | null {
	const storage = getSessionStorage();
	const raw = storage?.getItem(ONBOARDING_STATE_KEY);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			return null;
		if (
			!("step" in parsed) ||
			typeof parsed.step !== "number" ||
			!Number.isInteger(parsed.step) ||
			parsed.step < 1 ||
			parsed.step > ONBOARDING_TOTAL_STEPS ||
			!("fullName" in parsed) ||
			typeof parsed.fullName !== "string" ||
			!("role" in parsed) ||
			typeof parsed.role !== "string" ||
			!("goals" in parsed) ||
			!Array.isArray(parsed.goals) ||
			!parsed.goals.every((goal: unknown) => typeof goal === "string")
		)
			return null;
		return {
			...parsed,
			step: parsed.step,
			fullName: parsed.fullName,
			role: parsed.role,
			goals: parsed.goals,
		};
	} catch {
		storage?.removeItem(ONBOARDING_STATE_KEY);
		return null;
	}
}

export function clearOnboardingState() {
	getSessionStorage()?.removeItem(ONBOARDING_STATE_KEY);
}
