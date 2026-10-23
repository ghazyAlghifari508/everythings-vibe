"use client";

import {
	CodebaseResyncModal,
	type CodebaseResyncModalProps,
} from "./codebase-resync-modal";

/**
 * Re-export `CodebaseResyncModal` as `CodebaseResyncDrawer` for backwards compatibility.
 * The drawer has been replaced by the centered, non-intrusive `CodebaseResyncModal`.
 */
export const CodebaseResyncDrawer = CodebaseResyncModal;
export type { CodebaseResyncModalProps as CodebaseResyncDrawerProps };
