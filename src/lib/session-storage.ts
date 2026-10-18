interface SafeStorage {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem: (key: string) => void;
}

// Privacy settings can block the getter or any operation; draft persistence is best-effort.
export function getSessionStorage(): SafeStorage | null {
	try {
		if (typeof window === "undefined") return null;
		const raw = window.sessionStorage;
		if (!raw) return null;
		return {
			getItem: (key) => {
				try {
					return raw.getItem(key);
				} catch {
					return null;
				}
			},
			setItem: (key, value) => {
				try {
					raw.setItem(key, value);
				} catch {
					return;
				}
			},
			removeItem: (key) => {
				try {
					raw.removeItem(key);
				} catch {
					return;
				}
			},
		};
	} catch {
		return null;
	}
}

const CLOCK_SKEW_ALLOWANCE_MS = 60_000;

export function isPlausibleTimestamp(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value <= Date.now() + CLOCK_SKEW_ALLOWANCE_MS
	);
}
