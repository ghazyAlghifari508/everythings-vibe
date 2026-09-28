import { useEffect, useRef, useState } from "react";
import type { OutputLanguage } from "@/lib/language";

const WEB_PROMPTS_ID = [
	"Buatkan platform manajemen proyek untuk tim remote — fitur task board, time tracking, real-time collaboration, dan dashboard progress per sprint...",
	"Saya butuh sistem POS untuk restoran dengan menu digital, order management ke dapur, split bill, dan laporan penjualan harian...",
	"Buat marketplace UMKM dengan sistem katalog produk, keranjang belanja, integrasi pembayaran Midtrans, dan dashboard seller...",
	"Buatkan dashboard CRM untuk tim sales — pipeline management, lead scoring, email integration, dan analitik konversi...",
];

const MOBILE_PROMPTS_ID = [
	"Buatkan aplikasi delivery barang same-day dengan tracking GPS real-time, notifikasi status pesanan, dan sistem rating pengemudi...",
	"Saya ingin buat app reservasi rumah sakit — pilih dokter, jadwal konsultasi, rekam medis digital, dan reminder obat...",
	"Buat aplikasi personal finance dengan scan struk otomatis, kategorisasi pengeluaran, target tabungan, dan insight bulanan...",
	"Buatkan app komunitas hobi dengan fitur event organizer, forum diskusi, galeri foto, dan sistem point reward...",
];

const WEB_PROMPTS_EN = [
	"Build a project management platform for remote teams — task boards, time tracking, real-time collaboration, and sprint progress dashboards...",
	"I need a restaurant POS system with digital menus, kitchen order routing, split bills, and daily sales analytics...",
	"Create an e-commerce marketplace for local vendors with product catalogs, shopping carts, payment gateway integration, and seller dashboards...",
	"Build a sales CRM dashboard — pipeline tracking, lead scoring, email integration, and conversion analytics...",
];

const MOBILE_PROMPTS_EN = [
	"Build a same-day delivery app with real-time GPS tracking, order status push notifications, and driver rating system...",
	"I want a hospital appointment booking app — doctor lookup, consultation schedules, digital medical records, and medication reminders...",
	"Create a personal finance app with receipt scanning, automatic expense categorization, savings goals, and monthly insights...",
	"Build a hobby community app featuring event management, discussion forums, photo galleries, and a loyalty reward system...",
];

export function useTypingPlaceholder(
	isMobile: boolean,
	language: OutputLanguage = "id",
) {
	const prompts =
		language === "en"
			? isMobile
				? MOBILE_PROMPTS_EN
				: WEB_PROMPTS_EN
			: isMobile
				? MOBILE_PROMPTS_ID
				: WEB_PROMPTS_ID;
	const [display, setDisplay] = useState("");
	const indexRef = useRef(0);
	const charRef = useRef(0);
	const phaseRef = useRef<"typing" | "pausing" | "deleting">("typing");

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset typing animation when the prompt set changes; the dep is the trigger, not a read value
	useEffect(() => {
		indexRef.current = 0;
		charRef.current = 0;
		phaseRef.current = "typing";
		setDisplay("");
	}, [prompts]);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;

		const tick = () => {
			if (document.hidden) return; // don't advance/schedule while tab is hidden
			const current = prompts[indexRef.current % prompts.length];

			if (phaseRef.current === "typing") {
				if (charRef.current < current.length) {
					charRef.current++;
					setDisplay(current.slice(0, charRef.current));
					timer = setTimeout(tick, 30 + Math.random() * 30);
				} else {
					phaseRef.current = "pausing";
					timer = setTimeout(tick, 2500);
				}
			} else if (phaseRef.current === "pausing") {
				phaseRef.current = "deleting";
				timer = setTimeout(tick, 50);
			} else {
				if (charRef.current > 0) {
					charRef.current = Math.max(0, charRef.current - 2);
					setDisplay(current.slice(0, charRef.current));
					timer = setTimeout(tick, 15);
				} else {
					indexRef.current++;
					phaseRef.current = "typing";
					timer = setTimeout(tick, 400);
				}
			}
		};

		const handleVisibilityChange = () => {
			if (!document.hidden) {
				clearTimeout(timer);
				timer = setTimeout(tick, 60);
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);

		timer = setTimeout(tick, 500);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [prompts]);

	return display;
}
