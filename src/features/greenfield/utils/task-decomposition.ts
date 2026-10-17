import { TASK_GENERATION_PROMPT } from "@/features/greenfield/prompts/task";
import { normalizePlanningMode, type PlanningMode } from "./planning-mode";

/**
 * Conditional technical decomposition.
 *
 * The 5-layer decomposition (Data/Storage, Domain Logic, API Contract,
 * Dedicated Screen, UI States) is a greenfield heuristic: a brand-new product
 * legitimately touches every layer.
 *
 * On an existing codebase the same mandate causes scope expansion: a
 * client-side article search in a React/Vite app gets a database migration,
 * a backend endpoint, and a new authorization system purely because the layer
 * template requires them.
 *
 * Existing-codebase planning therefore treats every layer as CONDITIONAL: a
 * layer becomes a task only when the request, the requirement, or the
 * repository evidence justifies it. Layers are not forbidden — they must be
 * justified and traceable.
 */

export const CONDITIONAL_DECOMPOSITION_DIRECTIVE = `
=== DEKOMPOSISI TEKNIS KONDISIONAL (MODE EXISTING CODEBASE) ===
Aturan 5-LAYER DEKOMPOSISI TEKNIS di atas adalah panduan dekomposisi, BUKAN daftar layer yang wajib ada. Pada codebase existing, setiap layer bersifat KONDISIONAL dan hanya boleh menjadi task bila ada justifikasi.

CARA MENENTUKAN LAYER:
- Layer Data & Storage hanya bila perubahan memang menyentuh data/persistensi yang SUDAH ada atau benar-benar perlu diubah. Bila analisis codebase menunjukkan tidak ada database internal, DILARANG membuat task migrasi/skema database.
- Layer Domain & Business Logic hanya bila logika bisnis baru atau perubahan logika memang diperlukan.
- Layer API & Network Contract hanya bila ada endpoint/route yang benar-benar perlu dibuat atau diubah. DILARANG membuat endpoint backend baru bila perubahan cukup dikerjakan di client dengan data/state yang sudah ada.
- Layer UI Dedicated Screen hanya bila memang ada screen/halaman baru atau perubahan layout screen.
- Layer UI States & Interaction hanya bila memang ada state interaktif yang baru atau berubah.

DILARANG MEWAJIBKAN LAYER HANYA KARENA TEMPLATE:
JANGAN membuat task untuk database migration, backend endpoint, authentication, authorization/RBAC baru, dashboard, state management library baru, atau infrastructure baru, hanya karena template 5-layer atau contoh menyebutkannya. Layer tersebut hanya sah bila requirement atau bukti repositori mendukungnya.

CONTOH PENERAPAN (bukan daftar fitur baku, hanya ilustrasi penalaran):
- Bila pencarian dapat dilakukan dari data lokal memakai komponen dan state yang sudah ada, task WAJIB memakai pendekatan itu — tanpa task backend/database.
- Bila repositori memang memakai server-side search API, task boleh mencakup perubahan service/API sesuai arsitektur existing tersebut.
- Bila requirement eksplisit mensyaratkan login atau permission, task authorization boleh dibuat berdasarkan requirement dan bukti itu.

ARTINYA:
JANGAN melarang layer teknis tertentu secara mutlak. WAJIBKAN justifikasi yang dapat ditelusuri untuk setiap layer yang direncanakan.`;

export const CONDITIONAL_DECOMPOSITION_RULES = `
=== ATURAN DEKOMPOSISI (MODE EXISTING CODEBASE) ===
- Satu task = satu deliverable implementasi yang coherent dan bisa di-review sendiri.
- Modifikasi komponen/modul existing yang memadai. JANGAN membangun ulang komponen yang cukup dimodifikasi.
- Pisahkan tanggung jawab bila memang dibutuhkan; JANGAN menggabungkan tanggung jawab berbeda yang validasi/PR-nya terpisah.
- JANGAN membuat layer fiktif, empty/fake supporting task, atau task yang hanya ada karena contoh pada template.
- JANGAN memaksakan jumlah task. Jumlah task mengikuti deliverable yang benar-benar dibutuhkan oleh perubahan ini.
- Tetapkan priority berdasarkan DAMPAK produk/requirement, bukan berdasarkan layer.
- Gunakan file path aktual HANYA jika didukung bukti repositori; nyatakan file/modul baru sebagai proposed new file.`;

const EXISTING_CODEBASE_PREAMBLE = `Kamu adalah PrdFy AI, tech lead yang mengubah PRD + Acceptance Criteria menjadi IMPLEMENTATION PLAN untuk PERUBAHAN pada aplikasi yang SUDAH ADA. Rencanakan perubahan sekecil mungkin yang memenuhi requirement, memakai ulang komponen, service, route, dan kontrak data yang sudah ada.`;

/** Overrides the greenfield framing line of the base task prompt. */
function withExistingCodebaseFraming(prompt: string): string {
	const greenfieldFirstLine =
		"Kamu adalah PrdFy AI, tech lead yang mengubah PRD + Acceptance Criteria menjadi IMPLEMENTATION PLAN yang cukup detail untuk dikerjakan coding agent tanpa menebak-nebak.";
	return prompt.replace(greenfieldFirstLine, EXISTING_CODEBASE_PREAMBLE);
}

/**
 * Task generation prompt for a planning mode.
 *
 * Greenfield returns the base prompt unchanged. Existing codebase returns the
 * base prompt with the greenfield framing and the unconditional 5-layer
 * mandate replaced by the conditional decomposition directive, so the model
 * cannot read the layer list as a requirement checklist.
 */
export function buildTaskGenerationPrompt(
	mode: PlanningMode | string | null | undefined,
): string {
	if (normalizePlanningMode(mode) === "greenfield") {
		return TASK_GENERATION_PROMPT;
	}
	return [
		withExistingCodebaseFraming(TASK_GENERATION_PROMPT),
		CONDITIONAL_DECOMPOSITION_DIRECTIVE,
		CONDITIONAL_DECOMPOSITION_RULES,
	].join("\n");
}

/**
 * The task depth directive for a planning mode. The greenfield directive
 * mandates "Setiap fitur pada AC wajib dipecah ke dalam 5-layer teknis"; on an
 * existing codebase that same sentence is replaced with a conditional one, so
 * two independent prompt blocks cannot both demand every layer.
 */
const EXISTING_CODEBASE_TASK_DEPTH = `
## MODE KEDALAMAN: ADAPTIF & PROPORSIONAL TERHADAP PERUBAHAN
Sesuaikan jumlah task, subtask, dan detail dengan KOMPLEKSITAS sebenarnya dari perubahan yang diminta:
- Layer teknis (Data/Storage, Domain/Service Logic, API Contract, Dedicated Screen Layout, UI States & Interaction) bersifat KONDISIONAL — hanya dibuat bila requirement atau bukti repositori memang membutuhkannya.
- Perubahan kecil (misalnya revisi UI, penyesuaian perilaku satu komponen) → sedikit task yang proporsional. JANGAN menambah screen, route, API, atau data model baru.
- Perubahan kompleks (lintas frontend/backend/data dengan integrasi nyata) → dekomposisi lengkap dengan traceability requirement untuk setiap task.
Jumlah task mengikuti jumlah deliverable yang benar-benar dibutuhkan, bukan target angka. JANGAN memaksakan banyak task kosong untuk perubahan simpel. JANGAN mengurangi task atau menggabungkan requirement berbeda hanya agar output lebih pendek. Setiap subtask WAJIB punya field "details" (array langkah granular, minimum 1 item).`;

export function taskDepthDirectiveForMode(
	mode: PlanningMode | string | null | undefined,
	greenfieldDirective: string,
): string {
	return normalizePlanningMode(mode) === "greenfield"
		? greenfieldDirective
		: EXISTING_CODEBASE_TASK_DEPTH;
}
