export type SnapshotFilePreviewResult =
	| {
			status: "ok";
			snapshotId: string;
			path: string;
			content: string;
			truncated: boolean;
			sizeBytes: number;
	  }
	| {
			status: "unsupported";
			snapshotId: string;
			path: string;
			sizeBytes: number;
	  }
	| { status: "unavailable"; snapshotId: string | null; path: string };

export type SourcePreviewState =
	| { kind: "idle" }
	| { kind: "loading"; path: string }
	| {
			kind: "ready";
			path: string;
			content: string;
			truncated: boolean;
			sizeBytes: number;
	  }
	| { kind: "unsupported"; path: string }
	| { kind: "unavailable"; path: string }
	| { kind: "failed"; path: string; message: string };

export function toSourcePreviewState(
	result: SnapshotFilePreviewResult,
	requestedPath: string,
): SourcePreviewState {
	if (result.status === "ok") {
		if (result.content.length === 0) {
			return { kind: "unavailable", path: result.path };
		}
		return {
			kind: "ready",
			path: result.path,
			content: result.content,
			truncated: result.truncated,
			sizeBytes: result.sizeBytes,
		};
	}
	if (result.status === "unsupported") {
		return { kind: "unsupported", path: result.path };
	}
	return { kind: "unavailable", path: result.path || requestedPath };
}
