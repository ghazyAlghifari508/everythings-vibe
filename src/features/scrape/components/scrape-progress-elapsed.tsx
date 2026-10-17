import { useEffect, useState } from "react";

export function ElapsedTimer({ start }: { start: string }) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(id);
	}, []);
	const startMs = Date.parse(start);
	if (!Number.isFinite(startMs)) return null;
	return (
		<span
			role="timer"
			aria-label="Waktu proses"
			className="font-mono text-xs text-fog tabular-nums"
		>
			{((now - startMs) / 1000).toFixed(1)}s
		</span>
	);
}
