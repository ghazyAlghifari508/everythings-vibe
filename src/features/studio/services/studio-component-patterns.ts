// Static HTML adaptation of input-group composition; no React runtime in artboards.
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
		name: "MetricCard / Badge",
		html: '<article data-card><h2>Pendapatan</h2><p data-ui="value">Rp12.500.000</p><span data-ui="badge">Terverifikasi</span></article>',
	},
	{
		name: "Alert",
		html: '<div data-ui="alert" role="note"><strong>Periksa rincian</strong><p>Pastikan nilai sesuai sebelum melanjutkan.</p></div>',
	},
	{
		name: "Responsive ActionGroup",
		html: '<div data-ui="actions"><button type="button">Bandingkan</button><button type="button" data-primary>Ekspor CSV</button></div>',
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
@media(max-width:640px){:where([data-ui="actions"]){justify-content:flex-start}:where([data-ui="actions"]>button){flex:1 0 auto}}
</style>`;
