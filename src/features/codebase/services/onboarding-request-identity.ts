let fallbackRequestId: string | undefined;

export function readOnboardingRequestId(): string {
	try {
		const state: unknown = window.history.state;
		if (
			typeof state === "object" &&
			state !== null &&
			"codebaseStartRequest" in state &&
			typeof state.codebaseStartRequest === "string"
		)
			return state.codebaseStartRequest;
		const id = crypto.randomUUID();
		window.history.replaceState(
			{
				...(typeof state === "object" && state !== null ? state : {}),
				codebaseStartRequest: id,
			},
			"",
		);
		return id;
	} catch {
		fallbackRequestId ??= crypto.randomUUID();
		return fallbackRequestId;
	}
}
