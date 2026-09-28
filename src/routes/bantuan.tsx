import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, MessageSquare, Shield } from "lucide-react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { authClient } from "@/lib/auth-client";
import { isAdmin } from "@/lib/session";

export const Route = createFileRoute("/bantuan")({
	head: () => ({
		meta: [
			{ title: "Bantuan | VibeEverything" },
			{
				name: "description",
				content:
					"Pusat bantuan VibeEverything: FAQ, laporan bug dan feedback, serta triase admin.",
			},
		],
	}),
	component: BantuanPage,
});

export function BantuanPage() {
	// Display-only gate mirroring navbar.tsx; /admin's beforeLoad is the real authorization.
	const { data: session } = authClient.useSession();
	const canTriage = Boolean(session?.user && isAdmin(session.user));

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="Bantuan" />

			<header>
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Pusat Bantuan
				</h1>
				<p className="mt-3 max-w-2xl text-sm leading-6 text-fog">
					Semua laporan yang kamu kirim masuk ke satu antrean yang ditinjau tim
					admin. Pilih tujuan yang paling sesuai dengan kebutuhanmu.
				</p>
			</header>

			<section className="flex flex-col gap-3">
				<Link
					to="/faq"
					className="group flex items-center justify-between gap-4 rounded-xl border border-graphite bg-charcoal p-5 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span className="flex items-start gap-4">
						<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
							<BookOpen size={20} aria-hidden />
						</span>
						<span>
							<span className="block text-base font-semibold text-snow">
								FAQ
							</span>
							<span className="mt-1 block text-sm text-fog">
								Pertanyaan yang sering diajukan soal akun, kredit, dan alur
								kerja.
							</span>
						</span>
					</span>
					<ArrowRight
						size={18}
						aria-hidden
						className="shrink-0 text-fog transition-all group-hover:translate-x-1 group-hover:text-snow"
					/>
				</Link>

				<Link
					to="/settings/feedback"
					className="group flex items-center justify-between gap-4 rounded-xl border border-graphite bg-charcoal p-5 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<span className="flex items-start gap-4">
						<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
							<MessageSquare size={20} aria-hidden />
						</span>
						<span>
							<span className="block text-base font-semibold text-snow">
								Feedback & Bug Report
							</span>
							<span className="mt-1 block text-sm text-fog">
								Laporkan kendala, kirim kritik, atau minta fitur baru.
								Memerlukan login.
							</span>
						</span>
					</span>
					<ArrowRight
						size={18}
						aria-hidden
						className="shrink-0 text-fog transition-all group-hover:translate-x-1 group-hover:text-snow"
					/>
				</Link>

				{canTriage && (
					<Link
						to="/admin/feedback"
						className="group flex items-center justify-between gap-4 rounded-xl border border-graphite bg-charcoal p-5 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<span className="flex items-start gap-4">
							<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-fog">
								<Shield size={20} aria-hidden />
							</span>
							<span>
								<span className="block text-base font-semibold text-snow">
									Triase Admin
								</span>
								<span className="mt-1 block text-sm text-fog">
									Antrean feedback dan laporan error. Hanya untuk akun admin.
								</span>
							</span>
						</span>
						<ArrowRight
							size={18}
							aria-hidden
							className="shrink-0 text-fog transition-all group-hover:translate-x-1 group-hover:text-snow"
						/>
					</Link>
				)}
			</section>

			<p className="text-sm text-fog">
				Butuh bantuan soal pembayaran atau tagihan?{" "}
				<Link
					to="/settings/billing"
					className="text-snow underline underline-offset-4 transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Buka pengaturan billing
				</Link>
				.
			</p>
		</main>
	);
}
