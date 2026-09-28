"use client";

import { Bug, Check, Loader2, MessageSquare, Sparkles } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store";

export const FeedbackForm = memo(function FeedbackForm() {
	const [message, setMessage] = useState("");
	const [type, setType] = useState<"bug" | "feature" | "general">("general");
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const showToast = useUIStore((s) => s.showToast);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!message.trim()) return;

		setSending(true);
		try {
			const res = await fetch("/api/feedback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message, type }),
			});

			if (res.ok) {
				setSent(true);
				setMessage("");
				showToast("Feedback terkirim! Terima kasih.", "success");
				setTimeout(() => setSent(false), 3000);
			} else {
				showToast("Gagal mengirim feedback", "error");
			}
		} catch {
			showToast("Gagal mengirim feedback", "error");
		} finally {
			setSending(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<fieldset>
				<legend className="mb-1 block text-sm font-medium">
					Tipe Feedback
				</legend>
				<div className="flex gap-2">
					{(["general", "bug", "feature"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setType(t)}
							className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors flex items-center gap-1.5 ${
								type === t
									? "border-primary-black btn-primary"
									: "border-(--border-subtle) bg-(--bg-card) text-(--text-secondary) hover:border-primary-black"
							}`}
						>
							{t === "bug" ? (
								<>
									<Bug size={14} /> Bug Report
								</>
							) : t === "feature" ? (
								<>
									<Sparkles size={14} /> Fitur Baru
								</>
							) : (
								<>
									<MessageSquare size={14} /> Umum
								</>
							)}
						</button>
					))}
				</div>
			</fieldset>

			<div>
				<label
					htmlFor="feedback-message"
					className="mb-1 block text-sm font-medium"
				>
					Pesan Feedback
				</label>
				<textarea
					id="feedback-message"
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					placeholder={
						type === "bug"
							? "Jelaskan bug yang kamu temui..."
							: type === "feature"
								? "Jelaskan fitur yang ingin kamu minta..."
								: "Ceritakan pengalamanmu menggunakan VibeEverything..."
					}
					rows={4}
					className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-card) px-4 py-3 text-sm placeholder:text-(--text-secondary)/50 focus:border-primary-black focus:outline-none focus:ring-2 focus:ring-primary-black/5"
				/>
			</div>

			<Button
				type="submit"
				disabled={sending || !message.trim() || sent}
				className="flex items-center gap-2"
			>
				{sending ? (
					<>
						<Loader2 className="animate-spin" size={16} /> Mengirim...
					</>
				) : sent ? (
					<>
						<Check size={16} /> Terkirim!
					</>
				) : (
					"Kirim Feedback"
				)}
			</Button>
		</form>
	);
});
