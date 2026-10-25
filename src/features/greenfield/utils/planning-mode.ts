import {
	EXISTING_CODEBASE_PROJECT_MODES,
	type ExistingCodebaseProjectMode,
} from "@/features/codebase/services/sync";

/**
 * Planning-mode directives shared by Fitur, PRD, AC, and Task generation.
 *
 * everythings-vibe plans two fundamentally different jobs:
 *
 * - Greenfield: design a new application from the user's idea.
 * - Existing codebase: plan a CHANGE to an application that already exists.
 *
 * Both modes share validation schemas, output models, and the codebase
 * context loader, so the service layer is never duplicated. What differs is
 * the generation instruction: an existing-codebase plan must be a proportional,
 * evidence-grounded change instead of a greenfield rebuild.
 *
 * `buildPlanningModeDirective` returns "" for greenfield, so greenfield
 * prompts stay byte-identical and no existing behavior changes.
 */

/** Canonical planning modes. Mirrors `projects.projectMode`. */
export const PLANNING_MODES = EXISTING_CODEBASE_PROJECT_MODES;

export type PlanningMode = ExistingCodebaseProjectMode;

export const PLANNING_MODE_EXISTING_CODEBASE: PlanningMode =
	"existing_codebase";
export const PLANNING_MODE_GREENFIELD: PlanningMode = "greenfield";

/** Narrow an arbitrary value (a DB column, a request body) to a planning mode.
 *  Anything unrecognized is greenfield, matching the column default. */
export function normalizePlanningMode(
	value: string | null | undefined,
): PlanningMode {
	return value === PLANNING_MODE_EXISTING_CODEBASE
		? PLANNING_MODE_EXISTING_CODEBASE
		: PLANNING_MODE_GREENFIELD;
}

export function isExistingCodebaseMode(
	value: string | null | undefined,
): boolean {
	return normalizePlanningMode(value) === PLANNING_MODE_EXISTING_CODEBASE;
}

/**
 * Stage-scoped scope directive for an existing codebase.
 *
 * The single rule that fixes the reported failure: the plan describes the
 * MINIMUM change that satisfies the request, reusing what already exists,
 * instead of a greenfield product designed from scratch.
 */
const EXISTING_CODEBASE_SCOPE_RULES = `
=== MODE: EXISTING CODEBASE (PERUBAHAN, BUKAN MEMBANGUN DARI NOL) ===
Aplikasi SUDAH ADA. Tugasmu merencanakan PERUBAHAN yang benar-benar diminta — bukan merancang produk baru.

SUMBER KEBENARAN (urutan prioritas, jangan dilanggar):
1. Permintaan asli user dan jawaban klarifikasi yang sudah dikonfirmasi.
2. Bukti repositori yang tersedia di konteks codebase (framework, bahasa, path, modul, database, auth).
3. Artefak yang sudah ada dan sudah tervalidasi scope-nya (Fitur/PRD/AC sebelumnya).
4. Inferensi teknis yang benar-benar diperlukan.

ATURAN SCOPE:
- Rencanakan HANYA perubahan yang diminta. JANGAN menambahkan fitur, halaman, role, integrasi, atau kapabilitas baru yang tidak diminta atau tidak dibutuhkan oleh permintaan tersebut.
- JANGAN menganggap aplikasi perlu dibangun ulang. Pertahankan perilaku, alur, dan modul existing yang tidak berkaitan dengan permintaan.
- Setiap bagian teknis (data, service, API, UI, state) WAJIB punya alasan yang bisa ditelusuri ke permintaan, requirement, atau bukti repositori. Tanpa alasan itu, jangan direncanakan.
- JANGAN mengarang file, path, dependency, endpoint, tabel, atau perilaku framework. Jika sesuatu tidak ada di konteks codebase, tandai sebagai asumsi yang perlu diverifikasi — jangan sajikan sebagai fakta.
- Jika analisis menunjukkan aplikasi tidak memiliki database internal atau backend, JANGAN merencanakan skema database, migration, atau endpoint backend baru.

REUSE SEBELUM MEMBUAT BARU:
- Utamakan memakai ulang fungsi, komponen, style, route, dan kontrak data yang sudah ada.
- Perluas modul existing bila memadai. Pertahankan backward compatibility.
- Jika sebuah file atau modul disebut, path dan fungsinya WAJIB berasal dari bukti repositori, atau dinyatakan eksplisit sebagai file baru yang diusulkan (proposed new file). JANGAN mencampuradukkan keduanya.
- JANGAN menyuruh coding agent membuat ulang bagian aplikasi yang sudah benar.`;

const EXISTING_CODEBASE_FITUR_RULES = `
=== ATURAN KHUSUS EXISTING CODEBASE (FITUR) ===
- Daftar fitur menggambarkan PERUBAHAN pada aplikasi ini, bukan blueprint produk baru.
- Jumlah fitur dan subfitur PROPORSIONAL terhadap permintaan. JANGAN memaksa 8-16 fitur atau memenuhi kuota domain.
- JANGAN menambahkan domain yang tidak diminta (misalnya manajemen akun, autentikasi, RBAC, dashboard, admin panel, pembayaran, logistik) hanya karena template domain menyebutkannya. Domain tersebut hanya boleh muncul bila permintaan user memang membutuhkannya.
- Bila permintaan hanya menyentuh sebagian kecil aplikasi, hasilnya boleh sedikit fitur/subfitur. Kecil tapi tepat lebih benar daripada lengkap tapi melebar.
- Fokuskan subfitur pada perilaku yang benar-benar berubah atau ditambahkan.`;

const EXISTING_CODEBASE_PRD_RULES = `
=== ATURAN KHUSUS EXISTING CODEBASE (PRD) ===
- Tulis PRD sebagai dokumen PERUBAHAN pada produk yang sudah ada, bukan PRD peluncuran produk baru.
- Section 1-2 mendeskripsikan konteks produk existing dan tujuan perubahan ini, bukan visi membangun produk dari awal.
- Section 5 User Flow hanya memuat flow yang TERDAMPAK. Section 5.3 Pages & Screens hanya memuat surface yang berubah atau ditambahkan, ditandai EXISTING / MODIFIED / NEW. JANGAN mendaftar Dashboard, Account Settings, Admin Panel, Login, atau Register bila tidak termasuk requirement.
- Section 6 Architecture & Tech Stack mendeskripsikan arsitektur yang SUDAH ADA dan bagaimana perubahan ini menyatu dengannya. JANGAN merancang sistem arsitektur baru hanya demi melengkapi template.
- Section 7 mengikuti kenyataan: bila analisis codebase menunjukkan tidak ada database internal, JANGAN mengarang skema tabel SQL/Prisma fiktif — dokumentasikan kontrak data dan client storage yang benar-benar dipakai.
- Sertakan non-goals / out-of-scope secara eksplisit untuk hal-hal yang sengaja tidak dikerjakan pada perubahan ini.
- Bila perubahan memerlukan modul baru, jelaskan alasannya berdasarkan kebutuhan nyata, bukan kelengkapan template.`;

const EXISTING_CODEBASE_AC_RULES = `
=== ATURAN KHUSUS EXISTING CODEBASE (AC) ===
- Tulis AC HANYA untuk perilaku yang berubah atau ditambahkan. JANGAN menulis AC untuk kapabilitas existing yang tidak berubah.
- Setiap AC harus bisa ditelusuri ke requirement pada permintaan/perubahan ini, bukan ke fitur umum yang "seharusnya ada".
- Spesifikasi data/API mengikuti arsitektur existing yang ada di konteks codebase. Bila tidak ada backend internal atau database, JANGAN mensyaratkan endpoint backend internal atau skema tabel baru — spesifikasikan kontrak yang benar-benar dipakai (client storage atau API pihak ketiga).
- State coverage (loading/empty/error/success) hanya untuk surface UI yang memang dibangun atau diubah pada perubahan ini.
- JANGAN menambahkan requirement baru (role, permission, halaman, integrasi) yang tidak diminta.`;

const EXISTING_CODEBASE_TASK_RULES = `
=== ATURAN KHUSUS EXISTING CODEBASE (TASK) ===
- Setiap task menjadi PERUBAHAN pada codebase yang ada, bukan pembangunan fitur dari nol.
- Task yang membangun ulang komponen yang cukup dimodifikasi = SALAH. Modifikasi dan perluasan modul existing lebih benar.
- Setiap task yang mengubah file/modul existing WAJIB menyebut path dari bukti repositori. Task yang mengusulkan modul baru WAJIB menyatakannya sebagai proposed new file. JANGAN mencampuradukkan keduanya.
- JANGAN membuat task yang membangun ulang perilaku yang sudah benar-benar ada di repositori.
- JANGAN membuat empty/fake supporting task, task layer fiktif, atau task yang hanya ada karena contoh pada template.`;

const SCOPE_DIRECTIVES: Record<PlanningMode, string> = {
	greenfield: "",
	existing_codebase: EXISTING_CODEBASE_SCOPE_RULES,
};

const STAGE_DIRECTIVES: Record<
	"fitur" | "prd" | "ac" | "task",
	Record<PlanningMode, string>
> = {
	fitur: { greenfield: "", existing_codebase: EXISTING_CODEBASE_FITUR_RULES },
	prd: { greenfield: "", existing_codebase: EXISTING_CODEBASE_PRD_RULES },
	ac: { greenfield: "", existing_codebase: EXISTING_CODEBASE_AC_RULES },
	task: { greenfield: "", existing_codebase: EXISTING_CODEBASE_TASK_RULES },
};

export type PlanningStage = keyof typeof STAGE_DIRECTIVES;

/** The shared change-scope directive. "" for greenfield. */
export function buildPlanningModeDirective(
	value: string | null | undefined,
): string {
	return SCOPE_DIRECTIVES[normalizePlanningMode(value)];
}

/** The change-scope directive plus the stage-specific rules. "" for greenfield. */
export function buildStageScopeDirective(
	stage: PlanningStage,
	value: string | null | undefined,
): string {
	const mode = normalizePlanningMode(value);
	const shared = SCOPE_DIRECTIVES[mode];
	const stageRules = STAGE_DIRECTIVES[stage][mode];
	if (!shared && !stageRules) return "";
	return [shared, stageRules].filter((part) => part.trim()).join("\n");
}
