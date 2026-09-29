"use client";

import { Link } from "@tanstack/react-router";
import { ArrowRight, Compass, House } from "lucide-react";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";

export interface NotFoundComponentProps {
	data?: unknown;
}

export function NotFoundComponent(_props?: NotFoundComponentProps) {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
			<HubBreadcrumb current="Halaman tidak ditemukan" />

			<header className="mx-auto max-w-xl text-center">
				<p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-fog">
					404
				</p>
				<h1 className="text-3xl font-semibold tracking-tight text-snow sm:text-4xl">
					Halaman tidak ditemukan
				</h1>
				<p className="mt-3 text-sm leading-6 text-fog">
					Alamat yang kamu tuju tidak terdaftar.
				</p>
			</header>

			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<Link
					to="/"
					className="group flex flex-col justify-between rounded-xl border border-graphite bg-charcoal p-8 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<div>
						<span className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow">
							<House size={24} aria-hidden />
						</span>
						<p className="mb-2 font-mono text-xs uppercase tracking-widest text-fog">
							Halaman Utama
						</p>
						<h2 className="text-2xl font-semibold text-snow">
							Kembali ke beranda
						</h2>
						<p className="mt-3 text-sm leading-6 text-fog">
							Kembali ke halaman utama untuk merancang ide baru atau melanjutkan
							workspace aktif.
						</p>
					</div>
					<div className="mt-6 flex items-center justify-between gap-3 border-t border-graphite pt-6 text-xs">
						<span className="font-mono text-fog">Menuju /</span>
						<span className="flex items-center gap-1 font-mono text-snow">
							Buka
							<ArrowRight
								size={14}
								aria-hidden
								className="transition-transform group-hover:translate-x-1"
							/>
						</span>
					</div>
				</Link>

				<Link
					to="/plan"
					className="group flex flex-col justify-between rounded-xl border border-graphite bg-charcoal p-8 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<div>
						<span className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow">
							<Compass size={24} aria-hidden />
						</span>
						<p className="mb-2 font-mono text-xs uppercase tracking-widest text-fog">
							Workspace Planner
						</p>
						<h2 className="text-2xl font-semibold text-snow">Buka VibePlan</h2>
						<p className="mt-3 text-sm leading-6 text-fog">
							Rancang produk baru dari awal atau hubungkan repository codebase
							yang sudah ada.
						</p>
					</div>
					<div className="mt-6 flex items-center justify-between gap-3 border-t border-graphite pt-6 text-xs">
						<span className="font-mono text-fog">Menuju /plan</span>
						<span className="flex items-center gap-1 font-mono text-snow">
							Buka
							<ArrowRight
								size={14}
								aria-hidden
								className="transition-transform group-hover:translate-x-1"
							/>
						</span>
					</div>
				</Link>
			</div>
		</main>
	);
}
