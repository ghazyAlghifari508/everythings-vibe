"use client";

import { Tabs } from "@heroui/react";
import { useState } from "react";
import type { ShadowUsageBenchmarkResponse } from "../services";
import type {
	AdminCreditSearchParams,
	AdminCreditUsageResult,
	AdminCreditUsageSummary,
	AdminOperationalCostStats,
} from "../types/admin-credit";
import { AdminCreditCostPanel } from "./admin-credit-cost-panel";
import { AdminCreditUsagePanel } from "./admin-credit-usage-panel";

interface AdminCreditViewProps {
	result: AdminCreditUsageResult;
	summary: AdminCreditUsageSummary;
	costStats: AdminOperationalCostStats;
	benchmark: ShadowUsageBenchmarkResponse;
	searchParams: AdminCreditSearchParams;
}

export function AdminCreditView({
	result,
	summary,
	costStats,
	benchmark,
	searchParams,
}: AdminCreditViewProps) {
	const [tab, setTab] = useState("usage");

	return (
		<div className="mx-auto max-w-7xl space-y-6 font-inter">
			<header className="border-b border-graphite pb-6">
				<h1 className="text-2xl font-[510] text-snow">Kredit</h1>
				<p className="mt-1 max-w-3xl text-sm text-fog">
					Pemantauan penggunaan kredit berdasarkan buku besar dan biaya
					operasional berdasarkan telemetri. Halaman ini hanya membaca data,
					tidak mengubah saldo, harga, atau status.
				</p>
			</header>

			<Tabs
				selectedKey={tab}
				onSelectionChange={(key) => {
					if (key === "usage" || key === "cost") setTab(key);
				}}
				className="space-y-6"
			>
				<Tabs.List
					aria-label="Jenis pemantauan kredit"
					className="flex gap-1 border-b border-graphite"
				>
					<Tabs.Tab
						id="usage"
						className="min-h-11 rounded-t-md px-4 text-sm text-fog outline-none data-[selected=true]:border-b data-[selected=true]:border-fog data-[selected=true]:text-snow data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-indigo"
					>
						Penggunaan
					</Tabs.Tab>
					<Tabs.Tab
						id="cost"
						className="min-h-11 rounded-t-md px-4 text-sm text-fog outline-none data-[selected=true]:border-b data-[selected=true]:border-fog data-[selected=true]:text-snow data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-indigo"
					>
						Biaya Operasional
					</Tabs.Tab>
				</Tabs.List>
				<Tabs.Panel id="usage" className="outline-none">
					{tab === "usage" && (
						<AdminCreditUsagePanel
							result={result}
							summary={summary}
							searchParams={searchParams}
						/>
					)}
				</Tabs.Panel>
				<Tabs.Panel id="cost" className="outline-none">
					{tab === "cost" && (
						<AdminCreditCostPanel stats={costStats} benchmark={benchmark} />
					)}
				</Tabs.Panel>
			</Tabs>
		</div>
	);
}
