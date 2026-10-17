import { useCallback, useState } from "react";

export function useChatResumeModal() {
	const [showResumeModal, setShowResumeModal] = useState(false);
	const [resumeErrorMsg, setResumeErrorMsg] = useState("");
	const [partialContentStore, setPartialContentStore] = useState("");
	const [originalMessageStore, setOriginalMessageStore] = useState("");

	const triggerResumeModal = useCallback(
		(errorMsg: string, partialContent: string, originalMessage: string) => {
			setResumeErrorMsg(errorMsg);
			setPartialContentStore(partialContent);
			setOriginalMessageStore(originalMessage);
			setShowResumeModal(true);
		},
		[],
	);

	const clearResumeModal = useCallback(() => {
		setShowResumeModal(false);
	}, []);

	return {
		showResumeModal,
		setShowResumeModal,
		resumeErrorMsg,
		partialContentStore,
		originalMessageStore,
		triggerResumeModal,
		clearResumeModal,
	};
}
