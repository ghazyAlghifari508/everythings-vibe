"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToastNotice } from "@/components/ui/toast";
import type { StudioElementEditing } from "../../hooks/use-studio-element-editing";

const NOTICE_TIMEOUT_MS = 6000;
const noticeMessages = {
	text: "Teks diperbarui",
	delete: "Elemen dihapus",
	ai: "Revisi elemen diterapkan",
};

const feedbackButton =
	"h-11 shrink-0 px-2 text-snow motion-reduce:transition-none motion-reduce:active:scale-100";

export function StudioElementFeedback({
	editing,
	onReturnFocus,
}: {
	editing: StudioElementEditing;
	onReturnFocus?: () => void;
}) {
	const { busy, error, notice, pending, transition, undo } = editing;
	const [dismissedId, setDismissedId] = useState<string>();
	const [hoveredId, setHoveredId] = useState<string>();
	const [focusedId, setFocusedId] = useState<string>();
	const countdown = useRef({ id: "", remaining: NOTICE_TIMEOUT_MS });
	const activeNotice = notice?.row.id === dismissedId ? null : notice;
	const activeId = activeNotice?.row.id;
	const visibleNotice = error ? null : activeNotice;
	const noticeId = visibleNotice?.row.id;
	const paused =
		!!noticeId && (hoveredId === noticeId || focusedId === noticeId);

	useEffect(() => {
		if (!activeId) return;
		if (countdown.current.id !== activeId) {
			countdown.current = { id: activeId, remaining: NOTICE_TIMEOUT_MS };
		}
		if (paused) return;
		const clock = countdown.current;
		const started = Date.now();
		const timer = setTimeout(() => setDismissedId(activeId), clock.remaining);
		return () => {
			clearTimeout(timer);
			clock.remaining = Math.max(0, clock.remaining - (Date.now() - started));
		};
	}, [activeId, paused]);

	function dismissNotice() {
		if (noticeId && focusedId === noticeId) onReturnFocus?.();
		setHoveredId(undefined);
		setFocusedId(undefined);
		setDismissedId(noticeId);
	}

	const readyPreview = pending?.status === "preview" ? pending : null;
	const noticeUndo = undo?.id === noticeId ? undo : null;
	return (
		<div
			data-testid="studio-element-feedback"
			className="grid min-w-0 justify-items-end gap-y-1"
		>
			{pending ? (
				<ToastNotice
					compact
					message={readyPreview?.summary ?? "Menyiapkan revisi elemen…"}
					action={
						readyPreview ? (
							<>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className={feedbackButton}
									disabled={busy}
									onClick={() => void transition(readyPreview, "cancel")}
								>
									Batalkan
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className={feedbackButton}
									disabled={busy}
									onClick={() => void transition(readyPreview, "apply")}
								>
									Terapkan
								</Button>
							</>
						) : null
					}
				/>
			) : null}
			<ToastNotice
				compact
				message={visibleNotice ? noticeMessages[visibleNotice.kind] : null}
				onDismiss={visibleNotice ? dismissNotice : undefined}
				onPointerEnter={(event) => {
					if (event.pointerType !== "touch") setHoveredId(noticeId);
				}}
				onPointerLeave={() => setHoveredId(undefined)}
				onFocus={() => setFocusedId(noticeId)}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) {
						setFocusedId(undefined);
					}
				}}
				action={
					noticeUndo ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className={feedbackButton}
							disabled={busy}
							onClick={() => {
								dismissNotice();
								void transition(noticeUndo, "undo");
							}}
						>
							Undo
						</Button>
					) : null
				}
			/>
			{error ? <ToastNotice compact type="error" message={error} /> : null}
		</div>
	);
}
