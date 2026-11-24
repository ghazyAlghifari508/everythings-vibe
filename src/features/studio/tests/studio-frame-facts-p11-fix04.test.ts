import { describe, expect, it } from "vitest";
import {
	compareStudioFrameHtml,
	extractStudioFrameFacts,
} from "../services/studio-frame-facts";

const page = `<!doctype html><html><head><title>Hidden title</title><style>.x{content:"CSS text"}</style><script>const secret="script text"</script></head>
<body>
<nav><a href="#">Jelajah</a><a href="#">Tiket Saya</a><a href="#"><svg></svg></a></nav>
<main>
<h1>Profil &amp; Akun</h1>
<h2>Data Pemesan</h2>
<form>
<label for="n">Nama lengkap</label><input id="n" type="text">
<input type="email" placeholder="Email aktif">
<input type="hidden" value="token">
<button type="submit">Simpan</button>
</form>
<table><tr><td>Satu</td></tr></table>
<a role="button" href="#">Keluar</a>
<!-- Komentar tidak tampil -->
</main></body></html>`;

describe("frame facts", () => {
	it("reads only text and controls that exist in the committed markup", () => {
		const facts = extractStudioFrameFacts(page);
		expect(facts.headings).toEqual(["Profil & Akun", "Data Pemesan"]);
		expect(facts.navigation).toEqual(["Jelajah", "Tiket Saya"]);
		expect(facts.fields).toEqual(["Nama lengkap", "Email aktif"]);
		expect(facts.actions).toEqual(["Simpan", "Keluar"]);
		expect(facts.forms).toBe(1);
		expect(facts.tables).toBe(1);
		const everything = JSON.stringify(facts);
		for (const hidden of [
			"Hidden title",
			"CSS text",
			"script text",
			"Komentar",
		])
			expect(everything).not.toContain(hidden);
	});

	it("reports nothing for a screen that has no forms, tables or controls", () => {
		const facts = extractStudioFrameFacts(
			"<body><h1>Beranda</h1><p>Teks</p></body>",
		);
		expect(facts).toEqual({
			headings: ["Beranda"],
			navigation: [],
			actions: [],
			fields: [],
			forms: 0,
			tables: 0,
		});
	});

	it("stays bounded and total on hostile or broken input", () => {
		const many = Array.from(
			{ length: 60 },
			(_, i) => `<h2>Judul ${i}</h2>`,
		).join("");
		expect(extractStudioFrameFacts(many).headings).toHaveLength(6);
		const long = `<h1>${"x".repeat(5000)}</h1>`;
		expect(
			extractStudioFrameFacts(long).headings[0].length,
		).toBeLessThanOrEqual(120);
		for (const broken of ["", "<", "<h1>tanpa tutup", "<script>x", "<<<>>>"])
			expect(() => extractStudioFrameFacts(broken)).not.toThrow();
		expect(
			extractStudioFrameFacts("<h1>&#0;&#x110000;&bogus;</h1>").headings,
		).toBeDefined();
	});
});

describe("revision comparison", () => {
	it("lists added and removed visible text between two committed revisions", () => {
		const changes = compareStudioFrameHtml(
			"<body><h1>Profil</h1><button>Simpan</button></body>",
			"<body><h1>Profil</h1><button>Simpan Perubahan</button></body>",
		);
		expect(changes).toEqual({
			kind: "text",
			added: ["Simpan Perubahan"],
			removed: ["Simpan"],
		});
	});

	it("never calls a style-only revision a text change", () => {
		expect(
			compareStudioFrameHtml(
				'<body><h1 class="a">Profil</h1></body>',
				'<body><h1 class="b big">Profil</h1></body>',
			),
		).toEqual({ kind: "markup", added: [], removed: [] });
	});

	it("recognises an unchanged result as identical", () => {
		const html = "<body><h1>Profil</h1></body>";
		expect(compareStudioFrameHtml(html, `${html}\n`).kind).toBe("identical");
	});

	it("ignores script and style text on both sides", () => {
		expect(
			compareStudioFrameHtml(
				"<body><h1>A</h1><script>1</script></body>",
				"<body><h1>A</h1><script>2</script></body>",
			).kind,
		).not.toBe("text");
	});
});
