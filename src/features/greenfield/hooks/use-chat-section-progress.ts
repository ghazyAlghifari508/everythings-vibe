import { useCallback, useEffect, useState } from "react";
import { extractSections } from "@/features/greenfield/components/chat/chat-revision";
import { useChatStore } from "@/store";

export function useChatSectionProgress(
	currentPrdContent = "",
	isGeneratingPRD = false,
) {
	const completedSections = useChatStore((s) => s.completedSections);
	const setCompletedSections = useChatStore((s) => s.setCompletedSections);
	const [currentSection, setCurrentSection] = useState<string | null>(null);

	useEffect(() => {
		if (isGeneratingPRD && !currentSection) setCurrentSection("Overview");
	}, [isGeneratingPRD, currentSection]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional - only re-run when content changes
	useEffect(() => {
		if (!currentPrdContent || isGeneratingPRD) return;
		const found = extractSections(currentPrdContent);
		if (found.length > 0) setCompletedSections(found);
	}, [currentPrdContent]);

	const updateProgressFromContent = useCallback(
		(content: string) => {
			const foundSections = extractSections(content);
			if (foundSections.length > 0) {
				const lastSection = foundSections[foundSections.length - 1];
				const prev = foundSections.slice(0, -1);
				const currentCompleted = useChatStore.getState().completedSections;
				const merged = [...currentCompleted];
				for (const s of prev) {
					if (!merged.includes(s)) merged.push(s);
				}
				setCompletedSections(merged);
				setCurrentSection(lastSection);
			}
		},
		[setCompletedSections],
	);

	const markAllSectionsCompleted = useCallback(
		(content: string) => {
			const allDone = extractSections(content);
			if (allDone.length > 0) setCompletedSections(allDone);
			setCurrentSection(null);
		},
		[setCompletedSections],
	);

	return {
		completedSections,
		setCompletedSections,
		currentSection,
		setCurrentSection,
		updateProgressFromContent,
		markAllSectionsCompleted,
	};
}
