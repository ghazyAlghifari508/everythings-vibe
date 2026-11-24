import { useEffect, useState } from "react";
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
	const [viewportWidth, setViewportWidth] = useState<number | null>(null);
	const [desktopOpen, setDesktopOpen] = useState(true);
	const [mobileOpen, setMobileOpen] = useState(false);
	useEffect(() => {
		const media = window.matchMedia(STUDIO_CHAT_PANEL_DESKTOP_QUERY);
		const update = () => {
			setDesktop(media.matches);
			setMobileOpen(false);
			setViewportWidth(window.innerWidth);
		};
		const resize = () => setViewportWidth(window.innerWidth);
		update();
		media.addEventListener("change", update);
		window.addEventListener("resize", resize);
		return () => {
			media.removeEventListener("change", update);
			window.removeEventListener("resize", resize);
		};
	}, []);
	const open = desktop ? desktopOpen : mobileOpen;
	// Left space the canvas must keep clear when it frames content. `null` until
	// the breakpoint is known, so the opening view is never computed against a
	// guessed layout.
	const insetPx =
		viewportWidth === null
			? null
			: desktop && desktopOpen
				? studioChatPanelInsetPx(viewportWidth)
				: 0;
	return {
		desktop,
		open,
		setOpen: desktop ? setDesktopOpen : setMobileOpen,
		insetPx,
	};
}
