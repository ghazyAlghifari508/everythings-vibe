export interface ComposerKeyState {
	key: string;
	shiftKey: boolean;
	isComposing?: boolean;
	nativeEvent?: { isComposing?: boolean } | null;
}

// Enter submits a composer draft. Shift+Enter keeps its newline behavior and
// an active IME composition must never trigger a submit.
export function shouldSubmitComposerEvent(event: ComposerKeyState): boolean {
	if (event.key !== "Enter" || event.shiftKey) return false;
	if (event.isComposing) return false;
	if (event.nativeEvent?.isComposing) return false;
	return true;
}
