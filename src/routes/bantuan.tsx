import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/bantuan")({
	head: () => ({
		meta: [
			{ title: "Bantuan | everythings-vibe" },
			{
				name: "description",
				content:
					"Panduan bantuan everythings-vibe: cari langkah penggunaan produk, kelola kredit, dan temukan jawaban yang kamu butuhkan.",
			},
		],
	}),
	component: HelpLayout,
});

function HelpLayout() {
	return <Outlet />;
}
