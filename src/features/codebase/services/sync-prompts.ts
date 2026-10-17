import { resolveCodebaseDisplayName } from "@/features/codebase/services/naming";
import type { SyncPromptPayload } from "../types/sync-schemas";

// === External-agent prompt ===
// Self-contained execution document for a local AI coding agent (Claude Code,
// Codex CLI, Gemini CLI, OpenCode, …). The agent must not have to guess where
// it runs, when to install, whether to create `.everythingsvibeignore`, what the CLI
// already handles, what is forbidden, or how to report. Sections follow a fixed
// order: tujuan → project info → prasyarat → command → CLI-otomatis → aturan →
// kegagalan → format laporan.
//
// Boundaries kept deliberately:
// - One command, inline flags, no environment variable, no alternative. The
//   command stays on a single line: a backslash continuation is valid in
//   bash/zsh but is a parse error in PowerShell and cmd.exe, so a multi-line
//   form would break on Windows for no benefit.
// - No minimum-version number: the CLI validates it and prints the update
//   notice. The prompt only states that the CLI does it.
// - The exclusions section names categories with `.env` as the one concrete
//   example (it is a stable, universally understood name) but never enumerates
//   path patterns, which would rot and could contradict the CLI's built-ins.
// - The raw credential appears inline because a single copy-pasteable command
//   is the whole point; every other surface renders `<token>` instead (see
//   `buildSyncCommand`).
export function buildAgentPrompt(
	payload: SyncPromptPayload,
	context?: { projectName?: string },
): string {
	const command = `vibeeverything codebase sync --project-id ${payload.projectId} --sync-token ${payload.syncToken}`;
	// The repository name is genuinely unknown until the CLI handshakes: a
	// provisional creation placeholder is storage-only and must never be
	// presented as repository identity, so no name is invented here.
	const repositoryName = resolveCodebaseDisplayName(context?.projectName);
	const infoLines = [
		`Project ID   : ${payload.projectId}`,
		`Server       : ${payload.apiBaseUrl}`,
		`Sync Token   : ${payload.syncToken}`,
		`Expired At   : ${payload.expiresAt}`,
	];
	if (repositoryName) {
		infoLines.unshift(`Repository   : ${repositoryName}`);
	}

	return [
		"Sinkronkan codebase repositori lokal ini ke project VibeEverything menggunakan CLI resmi.",
		"Fokus hanya pada proses sinkronisasi; jangan melakukan perubahan terhadap source code.",
		"",
		"## Informasi Sinkronisasi",
		...infoLines,
		"",
		"## Prasyarat Eksekusi",
		"1. Pastikan kamu berada di root repositori Git.",
		"2. Periksa ketersediaan Node.js dan npm di sistem (`node -v` dan `npm -v`). Jangan berasumsi Node.js/npm sudah terpasang:",
		"   - Jika `node` atau `npm` belum terpasang atau versinya usang, unduh dan install Node.js versi LTS / stable terbaru (dari https://nodejs.org atau via package manager sistem seperti winget/brew/apt) sampai perintah `npm` siap digunakan.",
		"3. Gunakan VibeEverything CLI untuk menjalankan sinkronisasi.",
		"4. Jika command `vibeeverything` belum tersedia di terminal, install secara global:",
		"   npm i -g @ghazynabiel/vibeeverything",
		"",
		"## Perintah Yang Harus Dieksekusi",
		command,
		"",
		"## Yang Dilakukan CLI Otomatis",
		"Bagian ini bersifat informasi. Jangan kerjakan ulang secara manual.",
		"- Deteksi root repository.",
		"- Validasi versi minimum CLI.",
		"- Pembuatan `.everythingsvibeignore` otomatis jika belum ada file ignore kustom.",
		"- `.prdfyignore` lama tetap dihormati bila `.everythingsvibeignore` belum ada.",
		"- Penggunaan ignore bawaan.",
		"- Pengecualian file rahasia (termasuk `.env`), secret, dependency, build, dan cache.",
		"- Hashing dan upload hanya file yang diizinkan.",
		"",
		"## Aturan Yang Wajib Dipatuhi",
		"- [ ] Jangan mengubah source code.",
		"- [ ] Jangan membuat commit.",
		"- [ ] Jangan push.",
		"- [ ] Jangan mengedit `.gitignore`.",
		"- [ ] Jangan menulis Sync Token ke file proyek.",
		"- [ ] Jangan menyimpan token ke konfigurasi permanen.",
		"- [ ] Jangan memodifikasi `.everythingsvibeignore` kecuali diminta user.",
		"- [ ] Jangan mengklaim sinkronisasi berhasil tanpa output CLI.",
		"",
		"## Penanganan Kegagalan",
		"Jika sinkronisasi gagal:",
		"- Tampilkan pesan error CLI asli secara lengkap tanpa diringkas atau diubah.",
		"- Jangan mengubah file kode proyek untuk mencoba mengatasi kegagalan sinkronisasi.",
		"- Jangan retry dengan command atau flag di luar panduan resmi.",
		"- Berikan panduan tindakan transparan kepada user sesuai kondisi error:",
		"  * Jika sesi/token kedaluwarsa (`SYNC_EXPIRED` atau 401): Beri tahu user untuk kembali ke browser VibeEverything dan klik 'Coba Lagi' guna mendapatkan token baru.",
		"  * Jika koneksi server gagal (`ECONNREFUSED` atau Network Error): Beri tahu user untuk memeriksa koneksi internet atau ketersediaan server.",
		"  * Jika direktori bukan root git: Ingatkan user agar menjalankan agent tepat di folder root repositori Git.",
		"  * Jika install global npm terkendala izin (`EACCES`): Sarankan alternatif menjalankan via `npx @ghazynabiel/vibeeverything codebase sync ...`.",
		"",
		"## Format Laporan Akhir",
		"Kembalikan laporan kepada user dengan format berikut:",
		"",
		"Status:",
		"Berhasil / Gagal",
		"",
		"Project:",
		payload.projectId,
		"",
		"Server:",
		payload.apiBaseUrl,
		"",
		"CLI Version:",
		"<x.x.x dari output CLI, atau - jika tidak tersedia>",
		"",
		"Hasil CLI:",
		"<output CLI asli secara lengkap>",
		"",
		"Tindakan Untuk User:",
		"<Jika berhasil: 'Sinkronisasi repository berhasil. Sebutkan jumlah file dari output CLI asli. Hasil upload sudah tersimpan di VibeEverything. Analisis codebase berjalan terpisah di website dan mungkin belum selesai — arahkan user kembali ke VibeEverything untuk memantau status analisis sampai kesimpulan siap. Jangan menyatakan analisis selesai.'>",
		"<Jika gagal: sampaikan arahan solusi sesuai diagnosa di atas.>",
	].join("\n");
}
