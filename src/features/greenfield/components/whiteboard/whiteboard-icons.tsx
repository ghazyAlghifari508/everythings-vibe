"use client";

import {
	BellIcon,
	Calendar01Icon,
	CreditCardIcon,
	DeliveryTruck01Icon,
	File01Icon,
	LayoutGridIcon,
	Location01Icon,
	MessageSquareIcon,
	PackageIcon,
	Search01Icon,
	Settings01Icon,
	Shield01Icon,
	ShoppingCart01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "@/components/ui/icon";

type FeatureIconName =
	| "dashboard"
	| "package"
	| "cart"
	| "users"
	| "chat"
	| "shield"
	| "truck"
	| "search"
	| "settings"
	| "bell"
	| "calendar"
	| "card"
	| "file"
	| "map";

const FEATURE_ICON_RULES: Array<{ match: RegExp; icon: FeatureIconName }> = [
	{
		match: /dash|analit|statistik|laporan|overview|ringkas/i,
		icon: "dashboard",
	},
	{ match: /cari|search|filter|temu/i, icon: "search" },
	{ match: /stok|barang|invent|gudang|produk|katalog/i, icon: "package" },
	{
		match: /checkout|pesan|order|beli|bayar|transaksi|cart|keranjang/i,
		icon: "cart",
	},
	{ match: /akun|profil|user|pengguna|member|anggota/i, icon: "users" },
	{ match: /notif|peringatan|pengingat|reminder|alert/i, icon: "bell" },
	{
		match: /chat|komentar|diskusi|broadcast/i,
		icon: "chat",
	},
	{ match: /admin|keamanan|izin|role|otoris/i, icon: "shield" },
	{
		match: /kirim|antar|kurir|pengiriman|logistik|tracking|lacak/i,
		icon: "truck",
	},
	{ match: /pengatur|setting|konfig|preferensi/i, icon: "settings" },
	{ match: /jadwal|agenda|kalender|booking|reserv/i, icon: "calendar" },
	{
		match: /langgan|tagih|invoice|bayar|kredit|topup|harga|paket/i,
		icon: "card",
	},
	{
		match: /artikel|berita|konten|dokumen|file|upload|media|galeri/i,
		icon: "file",
	},
	{ match: /lokasi|alamat|peta|maps|wilayah|cabang|toko/i, icon: "map" },
];

export type FeatureIconComponent = IconSvgElement;

const FEATURE_ICON_COMPONENTS: Record<FeatureIconName, FeatureIconComponent> = {
	dashboard: LayoutGridIcon,
	package: PackageIcon,
	cart: ShoppingCart01Icon,
	users: UserGroupIcon,
	chat: MessageSquareIcon,
	shield: Shield01Icon,
	truck: DeliveryTruck01Icon,
	search: Search01Icon,
	settings: Settings01Icon,
	bell: BellIcon,
	calendar: Calendar01Icon,
	card: CreditCardIcon,
	file: File01Icon,
	map: Location01Icon,
};

export function featureIconName(label: string): FeatureIconName {
	for (const rule of FEATURE_ICON_RULES) {
		if (rule.match.test(label)) return rule.icon;
	}
	return "dashboard";
}

export function FeatureIcon({
	label,
	size = 16,
}: {
	label: string;
	size?: number;
}) {
	const icon = FEATURE_ICON_COMPONENTS[featureIconName(label)];
	return <Icon icon={icon} size={size} aria-hidden />;
}
