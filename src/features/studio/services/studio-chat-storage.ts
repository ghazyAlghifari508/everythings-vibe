// Session storage is optional (private browsing can deny access); memory remains usable.
export function readStudioChatStorage(key: string): string | null {
	try {
		return sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStudioChatStorage(
	key: string,
	value: string | null,
): void {
	try {
		if (value === null) sessionStorage.removeItem(key);
		else sessionStorage.setItem(key, value);
	} catch {
		// Persistence is unavailable; never discard the in-memory draft.
		return;
	}
}
