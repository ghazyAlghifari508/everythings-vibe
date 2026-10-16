import { useCallback, useEffect, useState } from "react";
import { clearPrdDraft, getPrdDraft, savePrdDraft } from "@/lib/prompt-handoff";

export function useChatDraft(projectId?: string) {
	const draftKey = projectId ?? "new";

	const [input, setInput] = useState(() => {
		const draft = getPrdDraft(draftKey);
		if (
			draft.startsWith("[Platform:") ||
			draft.includes("Generate PRD lengkap")
		) {
			clearPrdDraft();
			return "";
		}
		return draft;
	});

	// ponytail: keep follow-up draft in sessionStorage so refresh mid-typing
	// doesn't wipe a half-typed PRD revision question.
	useEffect(() => {
		const t = setTimeout(() => savePrdDraft(draftKey, input), 300);
		return () => clearTimeout(t);
	}, [input, draftKey]);

	const clearDraft = useCallback(() => {
		clearPrdDraft();
		setInput("");
	}, []);

	return {
		input,
		setInput,
		clearDraft,
		draftKey,
	};
}
