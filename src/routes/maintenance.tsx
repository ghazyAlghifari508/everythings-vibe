import { createFileRoute } from "@tanstack/react-router";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/maintenance")({
	component: MaintenancePage,
});

function MaintenancePage() {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "100vh",
				backgroundColor: "#0d0d0d",
				color: "#e0e0e0",
				fontFamily: "system-ui, -apple-system, sans-serif",
				padding: "20px",
				textAlign: "center",
			}}
		>
			<div style={{ marginBottom: "16px" }}>
				<Wrench size={64} color="#a0a0a0" />
			</div>
			<h1
				style={{
					fontSize: "28px",
					fontWeight: 600,
					margin: "0 0 8px",
					color: "#ffffff",
				}}
			>
				VibeEverything Sedang Dalam Perbaikan
			</h1>
			<p
				style={{
					fontSize: "16px",
					maxWidth: "440px",
					lineHeight: 1.6,
					color: "#a0a0a0",
				}}
			>
				Kami sedang melakukan perpindahan techstack besar-besaran untuk
				memberikan performa yang lebih baik. Aplikasi akan segera kembali
				online.
			</p>
			<div
				style={{
					marginTop: "24px",
					padding: "12px 24px",
					border: "1px solid #333",
					borderRadius: "8px",
					fontSize: "14px",
					color: "#666",
				}}
			>
				Perkiraan selesai: <strong style={{ color: "#999" }}>1-2 minggu</strong>
			</div>
		</div>
	);
}
