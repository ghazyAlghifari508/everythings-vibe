import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AnalysisCreditStatus } from "../../services/analysis-credit-policy";

export function AnalysisCreditNotice({
	status,
	onStart,
	isStarting,
	analysisOnly = false,
}: {
	status: AnalysisCreditStatus;
	onStart: () => void;
	isStarting: boolean;
	analysisOnly?: boolean;
}) {
	const free = status.code === "FREE_ALLOWANCE_AVAILABLE";
	const allowed = free || status.code === "CREDIT_REQUIRED";
	return (
		<Alert className="mx-auto max-w-2xl" role="status">
			<AlertTitle>
				{analysisOnly ? "Persetujuan analisis" : "Hubungkan repository"}
			</AlertTitle>
			<AlertDescription>
				<p>
					{free
						? "Analisis awal tersedia tanpa biaya tambahan."
						: status.code === "SUBSCRIPTION_PAUSED"
							? "Perpanjang langganan sebelum memulai analisis."
							: status.code === "ANALYSIS_IN_PROGRESS"
								? "Analisis awal sedang berjalan. Tunggu hingga selesai."
								: "Analisis repository membutuhkan kredit."}
				</p>
				<p className="mt-2">
					Saldo tersedia: {status.availableCredits} kredit.{" "}
					{free
						? "Satu analisis awal berhasil per akun; analisis ulang memerlukan kredit."
						: `Kebutuhan: hingga ${status.maximumCredits} kredit.`}
				</p>
				<p className="mt-2">
					Ukuran repository diperiksa saat sync. Biaya akhir dihitung setelah
					data tersedia, sebelum analisis, dan tidak melebihi batas yang
					disetujui. Analisis gagal tidak ditagih.
				</p>
				<div className="mt-4 flex flex-wrap gap-3">
					{allowed && (
						<Button
							size="lg"
							className="h-auto min-h-11 max-w-full whitespace-normal text-center"
							onClick={onStart}
							disabled={isStarting}
						>
							{isStarting
								? "Menyiapkan sesi..."
								: free
									? analysisOnly
										? "Mulai Analisis"
										: "Mulai Sinkronisasi"
									: `Setujui hingga ${status.maximumCredits} kredit & ${analysisOnly ? "analisis" : "sinkronkan"}`}
						</Button>
					)}
					{!free && (
						<a
							className={buttonVariants({ size: "lg", variant: "outline" })}
							href="/settings/billing"
						>
							{status.code === "SUBSCRIPTION_PAUSED"
								? "Perpanjang Paket"
								: "Tambahkan Kredit"}
						</a>
					)}
				</div>
			</AlertDescription>
		</Alert>
	);
}
