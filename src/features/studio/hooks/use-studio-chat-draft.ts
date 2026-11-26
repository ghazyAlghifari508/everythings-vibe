import {
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	readStudioChatStorage,
	writeStudioChatStorage,
} from "../services/studio-chat-storage";

export function useStudioChatDraft(storageKey?: string) {
	const [prompt, setPrompt] = useState("");
	const current = useRef("");
	useEffect(() => {
		current.current = storageKey
			? (readStudioChatStorage(storageKey) ?? "")
			: "";
		setPrompt(current.current);
	}, [storageKey]);
	const updatePrompt = useCallback(
		(next: SetStateAction<string>) => {
			const value = typeof next === "function" ? next(current.current) : next;
			current.current = value;
			setPrompt(value);
			if (storageKey) writeStudioChatStorage(storageKey, value || null);
		},
		[storageKey],
	);
	return { prompt, setPrompt: updatePrompt };
}
