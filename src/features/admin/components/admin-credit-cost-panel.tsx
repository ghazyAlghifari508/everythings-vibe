"use client";

import { useEffect, useRef, useState } from "react";
import { statusIcons } from "@/components/ui/status-indicator";
import {
	getAdminOperationalCostStats,
	getShadowUsageBenchmark,
	type ShadowUsageBenchmarkResponse,
} from "../services";
import type { AdminOperationalCostStats } from "../types/admin-credit";
import {
	formatBytes,
	formatDuration,
	formatMinorAmount,
	formatPercent,
	resolveDateWindow,
} from "../utils/admin-credit-utils";
import { AdminMetricCard } from "./admin-metric-card";

interface AdminCreditCostPanelProps {
	stats: AdminOperationalCostStats;
	benchmark: ShadowUsageBenchmarkResponse;
}

const COST_OPERATIONS = [
	{ value: "all", label: "Semua operasi" },
	{ value: "generate_design", label: "Studio: generate design" },
	{ value: "patch_design", label: "Studio: patch design" },
	{ value: "generate_design_md", label: "Studio: generate DESIGN.md" },
	{ value: "scrape_site", label: "Scrape: scrape site" },
] as const;

const selectClass =
	"h-9 rounded-lg border border-graphite bg-charcoal px-2.5 text-xs font-inter text-snow focus:border-fog/40 focus:outline-none";

export function AdminCreditCostPanel({
	stats: initialStats,
	benchmark: initialBenchmark,
}: AdminCreditCostPanelProps) {
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [product, setProduct] = useState<"all" | "studio" | "scrape">("all");
	const [operation, setOperation] = useState("all");
	const [stats, setStats] = useState(initialStats);
	const [benchmark, setBenchmark] = useState(initialBenchmark);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const requestRef = useRef(0);

	useEffect(() => {
		const requestId = ++requestRef.current;
		setLoading(true);
		setError(false);
		const window = resolveDateWindow(from || undefined, to || undefined);
		const benchmarkFilter = {
			productFamily: product === "all" ? undefined : product,
			operationKind: operation === "all" ? undefined : operation,
			from: window.start?.toISOString(),
			to: window.end?.toISOString(),
			limit: 500,
		};

		void Promise.all([
			getAdminOperationalCostStats({
				data: {
					from: from || undefined,
					to: to || undefined,
					product,
					operation,
				},
			}),
			getShadowUsageBenchmark({ data: benchmarkFilter }),
		])
			.then(([nextStats, nextBenchmark]) => {
				if (requestRef.current !== requestId) return;
				setStats(nextStats);
				setBenchmark(nextBenchmark);
			})
			.catch(() => {
				if (requestRef.current !== requestId) return;
				setError(true);
			})
			.finally(() => {
				if (requestRef.current === requestId) setLoading(false);
			});
	}, [from, to, product, operation]);

	const tiles = [
		{
			label: "Permintaan kredit",
			value: stats.requests,
			subtext: `${stats.aiRequests} dengan pemakaian AI`,
			icon: statusIcons.neutral,
		},
		{
			label: "Input token",
			value: stats.inputTokens?.toLocaleString("id-ID") ?? "Tidak diukur",
			subtext: "Dari telemetri penyedia",
			icon: statusIcons.neutral,
		},
		{
			label: "Output token",
			value: stats.outputTokens?.toLocaleString("id-ID") ?? "Tidak diukur",
			subtext: "Dari telemetri penyedia",
			icon: statusIcons.neutral,
		},
		{
			label: "Durasi worker",
			value: formatDuration(stats.workerDurationMs),
			subtext: "Akumulasi waktu proses",
			icon: statusIcons.processing,
		},
		{
			label: "Durasi browser",
			value: formatDuration(stats.browserDurationMs),
			subtext: "Hanya untuk operasi dengan browser",
			icon: statusIcons.processing,
		},
		{
			label: "Transfer data",
			value: formatBytes(stats.downloadedBytes),
			subtext: `Output: ${formatBytes(stats.outputBytes)}`,
			icon: statusIcons.neutral,
		},
	];

	return (
		<div className="space-y-6">
			<section className="rounded-xl border border-graphite bg-charcoal p-5 shadow-[var(--shadow-inset)]">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<h2 className="text-base font-[510] text-snow">
							Biaya operasional, bukan tagihan pengguna
						</h2>
						<p className="mt-1 text-xs text-fog">
							Angka berikut berasal dari telemetri shadow aktual. Tidak ada
							konversi ke kredit pengguna.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<input
							type="date"
							value={from}
							onChange={(event) => setFrom(event.target.value)}
							aria-label="Tanggal mulai biaya operasional"
							className={`${selectClass} [color-scheme:dark]`}
						/>
						<input
							type="date"
							value={to}
							onChange={(event) => setTo(event.target.value)}
							aria-label="Tanggal akhir biaya operasional"
							className={`${selectClass} [color-scheme:dark]`}
						/>
						<select
							value={product}
							onChange={(event) =>
								setProduct(event.target.value as "all" | "studio" | "scrape")
							}
							aria-label="Filter produk biaya operasional"
							className={selectClass}
						>
							<option value="all">Semua produk</option>
							<option value="studio">Studio</option>
							<option value="scrape">Scrape</option>
						</select>
						<select
							value={operation}
							onChange={(event) => setOperation(event.target.value)}
							aria-label="Filter operasi biaya operasional"
							className={selectClass}
						>
							{COST_OPERATIONS.map((item) => (
								<option key={item.value} value={item.value}>
									{item.label}
								</option>
							))}
						</select>
					</div>
				</div>
				{loading && (
					<p className="mt-3 text-xs text-fog">Memuat data terukur.</p>
				)}
				{error && (
					<p className="mt-3 text-xs text-danger">
						Data biaya operasional gagal dimuat.
					</p>
				)}
			</section>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{tiles.map((tile) => (
					<AdminMetricCard
						key={tile.label}
						label={tile.label}
						value={tile.value}
						subtext={tile.subtext}
						icon={tile.icon}
					/>
				))}
			</div>

			<section className="rounded-xl border border-graphite bg-charcoal p-5 shadow-[var(--shadow-inset)]">
				<h2 className="text-base font-[510] text-snow">
					Pemisahan biaya terukur dan estimasi
				</h2>
				<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
					<div className="py-2">
						<p className="text-[11px] text-mist">Biaya penyedia terukur</p>
						<p className="mt-1 font-mono text-sm text-snow">
							{formatMinorAmount(
								stats.measuredProviderCostMinor,
								stats.currency,
							)}
						</p>
						<p className="mt-1 text-[11px] text-fog">
							Dari respons API penyedia yang tercatat
						</p>
					</div>
					<div className="py-2">
						<p className="text-[11px] text-mist">
							Skenario biaya penyedia, bukan pengeluaran
						</p>
						<p className="mt-1 font-mono text-sm text-snow">
							{formatMinorAmount(
								stats.estimatedProviderCostMinor,
								stats.currency,
							)}
						</p>
						<p className="mt-1 text-[11px] text-fog">
							Estimasi berdasarkan token dan harga referensi
						</p>
					</div>
					<div className="py-2">
						<p className="text-[11px] text-mist">Estimasi infrastruktur</p>
						<p className="mt-1 font-mono text-sm text-snow">
							{formatMinorAmount(
								stats.estimatedInfrastructureCostMinor,
								stats.currency,
							)}
						</p>
						<p className="mt-1 text-[11px] text-fog">
							Perkiraan, bukan harga CPU atau RAM per operasi
						</p>
					</div>
				</div>
				<p className="mt-4 text-xs text-fog">
					Komponen tidak terukur:{" "}
					{benchmark.unmeasuredComponents.length
						? benchmark.unmeasuredComponents.join(", ")
						: "Tidak ada yang ditandai"}
					. Sampel benchmark: {benchmark.sampledRecords}.
				</p>
			</section>

			<section className="overflow-x-auto rounded-xl border border-graphite bg-charcoal">
				<table className="w-full min-w-[860px] text-left text-xs font-inter">
					<thead className="border-b border-graphite text-[11px] text-mist">
						<tr>
							<th className="px-3 py-2.5 font-medium">Operasi</th>
							<th className="px-3 py-2.5 text-right font-medium">Sampel</th>
							<th className="px-3 py-2.5 text-right font-medium">Median</th>
							<th className="px-3 py-2.5 text-right font-medium">p95</th>
							<th className="px-3 py-2.5 text-right font-medium">
								Biaya terukur
							</th>
							<th className="px-3 py-2.5 font-medium">Hasil</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-graphite">
						{benchmark.groups.length === 0 ? (
							<tr>
								<td colSpan={6} className="px-3 py-12 text-center text-fog">
									Belum ada data benchmark untuk filter ini.
								</td>
							</tr>
						) : (
							benchmark.groups.map((group) => (
								<tr key={group.operationKind}>
									<td className="px-3 py-2.5 text-snow">
										{group.operationKind}
									</td>
									<td className="px-3 py-2.5 text-right font-mono text-snow">
										{group.sampleCount}
									</td>
									<td className="px-3 py-2.5 text-right font-mono text-fog">
										{formatDuration(group.medianDurationMs)}
									</td>
									<td
										className="px-3 py-2.5 text-right font-mono text-fog"
										title={group.p95UnavailableReason ?? undefined}
									>
										{group.p95DurationMs === null
											? "Tidak tersedia"
											: formatDuration(group.p95DurationMs)}
									</td>
									<td className="px-3 py-2.5 text-right font-mono text-snow">
										{formatMinorAmount(
											group.measuredProviderCostMinor,
											stats.currency,
										)}
									</td>
									<td className="px-3 py-2.5 text-fog">
										{formatPercent(group.successRate)} sukses,{" "}
										{formatPercent(group.partialRate)} sebagian,{" "}
										{formatPercent(group.failureRate)} gagal. Retry{" "}
										{group.retryCount}.
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</section>
		</div>
	);
}
