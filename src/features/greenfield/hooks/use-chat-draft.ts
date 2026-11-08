import { useCallback, useEffect, useRef, useState } from "react";
import { getPrdDraft, savePrdDraft } from "@/lib/prompt-handoff";

export function useChatDraft(projectId?: string) {
	const draftKey = projectId ?? "new";

	const [input, setInput] = useState(() => {
		const draft = getPrdDraft(draftKey);
		if (
			draft.startsWith("[Platform:") ||
			draft.includes("Generate PRD lengkap")
		) {
			savePrdDraft(draftKey, "");
			return "";
		}
		return draft;
	});
	const latestInput = useRef(input);
	latestInput.current = input;
	useEffect(
		() => () => savePrdDraft(draftKey, latestInput.current),
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
