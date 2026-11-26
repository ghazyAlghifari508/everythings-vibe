import { useBlocker } from "@tanstack/react-router";
import { useUIStore } from "@/store";

/** Keep the owning view mounted until streaming/persistence reaches a terminal state. */
export function useGenerationNavigationGuard(active: boolean) {
	useBlocker({
		shouldBlockFn: ({ current, next }) => {
			if (!active || current.pathname === next.pathname) return false;
			useUIStore
				.getState()
				.showToast(
					"Proses masih berjalan atau belum tersimpan. Tunggu hingga selesai; batalkan melalui kontrol proses bila tersedia.",
					"info",
				);
			return true;
		},
		enableBeforeUnload: active,
	});
}
