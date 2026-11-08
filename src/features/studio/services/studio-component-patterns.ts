// Static HTML adaptation of input-group composition; no React runtime in artboards.
//
// Every rule here is written as `:where(...)`, i.e. zero specificity. A pattern
// is a starting point the screen may restyle; it must never outrank the design's
// own component rules the way the old canonical `min-height:44px; padding:10px
// 14px` blanket did.
export const STUDIO_COMPONENT_PATTERNS = [
	{
		name: "SearchInput",
		html: '<div data-ui="search"><input type="search" aria-label="Cari" value="Contoh"><button type="button" aria-label="Hapus pencarian">×</button></div>',
	},
	{
		name: "SegmentedControl / Tabs",
		html: '<div data-ui="segments" role="group" aria-label="Filter status"><button aria-pressed="true">Semua</button><button aria-pressed="false">Aktif</button><button aria-pressed="false">Draft</button><button aria-pressed="false">Arsip</button></div>',
	},
	{
		name: "Select / Dropdown / FormField",
		html: '<div data-ui="field"><label for="package">Paket</label><select id="package"><option>Semua paket</option></select></div>',
	},
	{
		name: "DataTable",
		html: '<div data-table-container tabindex="0" role="region" aria-label="Data transaksi"><table><caption>Transaksi</caption><thead><tr><th scope="col">Referensi</th><th scope="col">Jumlah</th></tr></thead><tbody><tr><td>INV-001</td><td>Rp1.250.000</td></tr></tbody></table></div>',
	},
	{
		name: "MetricCard",
		html: '<article data-card><h2>Pendapatan</h2><p data-ui="value">Rp12.500.000</p></article>',
	},
	{
		name: "Alert",
		html: '<div data-ui="alert" role="note"><strong>Periksa rincian</strong><p>Pastikan nilai sesuai sebelum melanjutkan.</p></div>',
	},
	{
		name: "Responsive ActionGroup",
		html: '<div data-ui="actions"><button type="button">Bandingkan</button><button type="button" data-primary>Ekspor CSV</button></div>',
	},
	{
		name: "QuantityStepper",
		html: '<div data-ui="stepper" role="group" aria-label="Jumlah"><button type="button" aria-label="Kurangi jumlah">−</button><output aria-label="Jumlah saat ini">1</output><button type="button" aria-label="Tambah jumlah">+</button></div>',
	},
	{
		name: "HorizontalCarousel",
		html: '<div data-ui="carousel" role="region" aria-label="Promo pilihan" tabindex="0"><article data-card><h3>Promo 1</h3><p>Diskon 20%</p></article><article data-card><h3>Promo 2</h3><p>Gratis ongkir</p></article></div>',
	},
	{
		name: "OptionRow / RadioGroup / Checkbox",
		html: '<fieldset data-ui="options"><legend>Pilihan</legend><label data-ui="option"><input type="radio" name="option" checked><span><strong>Pilihan utama</strong><small>Deskripsi pilihan</small></span><span data-ui="value">+Rp8.000</span></label></fieldset>',
	},
	{
		name: "ProductRow / MediaCard",
		html: '<article data-ui="product-row" data-card><figure data-media="product"><figcaption>Foto produk</figcaption></figure><div><h3>Nama produk</h3><p>Deskripsi produk</p><div data-ui="actions"><span data-ui="value">Rp27.000</span><button aria-label="Tambah produk">+</button></div></div></article>',
	},
];

export const STUDIO_COMPONENT_STYLE = `<style id="studio-component-patterns">
:where([data-ui="search"]){display:flex;align-items:center;gap:4px;min-width:0;width:100%;border:var(--app-border);border-radius:var(--app-radius);background:var(--app-surface)}
:where([data-ui="search"]>input){flex:1;min-width:0;width:0;border:0;background:transparent}
:where([data-ui="search"]>button){flex:0 0 44px;width:44px;min-height:44px;padding:0;border:0;background:transparent}
:where([data-ui="segments"]){display:flex;gap:4px;max-width:100%;min-width:0;overflow-x:auto;padding:4px}
:where([data-ui="segments"]>button){flex:none;white-space:nowrap}
:where([data-ui="field"]){display:grid;gap:6px;min-width:0}
:where([data-ui="field"]>input,[data-ui="field"]>select,[data-ui="field"]>textarea){width:100%;min-width:0}
:where([data-ui="field"]>select){padding-inline-end:32px}
:where([data-ui="actions"]){display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
:where([data-ui="actions"]>button,[data-ui="badge"],[data-ui="value"]){white-space:nowrap;word-break:normal;overflow-wrap:normal}
:where([data-ui="alert"]){padding:16px;border:var(--app-border);border-radius:var(--app-radius)}
:where([data-ui="stepper"]){display:inline-flex;align-items:center;border:var(--app-border);border-radius:var(--app-radius);background:var(--app-surface)}
:where([data-ui="stepper"]>button){flex:0 0 36px;width:36px;height:36px;min-height:36px;padding:0;border:0;border-radius:0;background:transparent;font-size:18px;line-height:1}
:where([data-ui="stepper"]>output){flex:0 0 auto;min-width:40px;padding:0 4px;text-align:center;font-variant-numeric:tabular-nums}
:where([data-ui="carousel"]){display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;max-width:100%;padding-bottom:4px}
:where([data-ui="carousel"]>*){flex:0 0 auto;scroll-snap-align:start}
:where([data-ui="options"]){display:grid;gap:8px;min-width:0;border:0;padding:0}
:where([data-ui="option"]){display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;min-height:44px;padding:12px;border:var(--app-border);border-radius:var(--app-radius)}
:where([data-ui="option"]:has(input:checked)){outline:2px solid var(--app-primary);outline-offset:-2px}
:where([data-ui="option"] small){display:block;white-space:normal}
:where([data-ui="product-row"]){display:grid;grid-template-columns:minmax(72px,30%) minmax(0,1fr);gap:12px;align-items:start}
:where([data-ui="product-row"] figure){margin:0;overflow:hidden}
:where([data-ui="value"], [data-ui="stepper"]>output){white-space:nowrap;font-variant-numeric:tabular-nums;flex-shrink:0}
@media(max-width:640px){:where([data-ui="actions"]){justify-content:flex-start}:where([data-ui="actions"]>button){flex:1 0 auto}}
</style>`;
