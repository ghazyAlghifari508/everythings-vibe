import { useEffect, useState } from "react";

export function useStudioChatPanel() {
	const [desktop, setDesktop] = useState(false);
	const [desktopOpen, setDesktopOpen] = useState(true);
	const [mobileOpen, setMobileOpen] = useState(false);
	useEffect(() => {
		const media = window.matchMedia("(min-width: 1024px)");
		const update = () => {
			setDesktop(media.matches);
			setMobileOpen(false);
		};
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	return {
		desktop,
		open: desktop ? desktopOpen : mobileOpen,
		setOpen: desktop ? setDesktopOpen : setMobileOpen,
	};
}
