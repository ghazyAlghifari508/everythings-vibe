import { useEffect, useMemo, useState } from "react";
import { STUDIO_CHAT_PANEL_DESKTOP_QUERY } from "../types/studio-constants";
import { studioChatPanelInsetPx } from "../utils/studio-chat-layout";

/**
 * Open state of the floating chat panel. Desktop and drawer keep separate flags,
 * so crossing the breakpoint never reopens or closes the other presentation.
 * The panel is independent of the workspace header and of the canvas: toggling it
 * changes only this state, never the frames, jobs or canvas view.
 */
export function useStudioChatPanel() {
	const [desktop, setDesktop] = useState(false);
	const [ready, setReady] = useState(false);
	const [desktopOpen, setDesktopOpen] = useState(true);
	const [mobileOpen, setMobileOpen] = useState(false);
	useEffect(() => {
		const media = window.matchMedia(STUDIO_CHAT_PANEL_DESKTOP_QUERY);
		const update = () => {
			setDesktop(media.matches);
			setMobileOpen(false);
			setReady(true);
		};
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	const open = desktop ? desktopOpen : mobileOpen;
	// Left space the canvas must keep clear when it frames content. `null` until
	// the breakpoint is known, so the opening view is never computed against a
	// guessed layout.
	const insetPx = useMemo(
		() =>
			ready
				? desktop && desktopOpen
					? studioChatPanelInsetPx(window.innerWidth)
					: 0
				: null,
		[ready, desktop, desktopOpen],
	);
	return {
		desktop,
		open,
		setOpen: desktop ? setDesktopOpen : setMobileOpen,
		insetPx,
	};
}
