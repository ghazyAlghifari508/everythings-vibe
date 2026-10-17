// Compatibility facade. The implementation lives in the scrape feature.

export type {
	PreviewFrameReport,
	PreviewReadinessState,
} from "@/features/scrape/utils/preview-readiness";
export {
	INITIAL_PREVIEW_READINESS,
	isFinalPreviewReport,
	previewDisplayReport,
	previewFrameResponded,
	previewShouldKeepPolling,
	reducePreviewReport,
} from "@/features/scrape/utils/preview-readiness";
