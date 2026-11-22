import { useCallback, useEffect, useRef, useState } from "react";
import { getPrdDraft, savePrdDraft } from "@/lib/prompt-handoff";

function readDraft(draftKey: string): string {
	const draft = getPrdDraft(draftKey);
	if (
		draft.startsWith("[Platform:") ||
		draft.includes("Generate PRD lengkap")
	) {
		savePrdDraft(draftKey, "");
		return "";
	}
	return draft;
}

export function useChatDraft(projectId?: string) {
	const draftKey = projectId ?? "new";

	const [input, setInput] = useState(() => readDraft(draftKey));
	const [loadedKey, setLoadedKey] = useState(draftKey);

	// Project switch inside one mounted hook: swap to the new project's draft in
	// the same render so the old text is never shown nor saved under the new key.
	if (loadedKey !== draftKey) {
		setLoadedKey(draftKey);
		setInput(readDraft(draftKey));
	}

	// Pairs the text with the key it was typed under; updated after commit so the
	// cleanup below still sees the previous project's draft when the key changes.
	const latest = useRef({ key: draftKey, input });
	useEffect(() => {
		latest.current = { key: draftKey, input };
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: draftKey is the trigger, not a read; cleanup must flush the previous project's draft on switch
	useEffect(
		() => () => savePrdDraft(latest.current.key, latest.current.input),
		[draftKey],
	);

	// ponytail: keep follow-up draft in sessionStorage so refresh mid-typing
	// doesn't wipe a half-typed PRD revision question.
	useEffect(() => {
		const timer = setTimeout(() => savePrdDraft(draftKey, input), 300);
		return () => clearTimeout(timer);
	}, [input, draftKey]);

	const clearDraft = useCallback(() => {
		savePrdDraft(draftKey, "");
		setInput("");
	}, [draftKey]);

	return {
		input,
		setInput,
		clearDraft,
		draftKey,
	};
}
