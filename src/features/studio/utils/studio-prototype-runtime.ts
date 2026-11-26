import type { StudioPrototypeInteraction } from "../types/studio-prototype";
import { STUDIO_PROTOTYPE_LIMITS } from "../types/studio-prototype";

export interface StudioPrototypeRuntimeConfig {
	channel: string;
	screenId: string;
	/** Parent origin: the only target the runtime ever posts to. */
	origin: string;
	interactions: Record<string, StudioPrototypeInteraction>;
}

/**
 * The trusted EvVibe prototype runtime, injected into the isolated document by
 * the server. It is the only script that runs: it executes manifest entries by
 * type (a closed switch, no eval, no dynamic code, no generated handlers) and
 * reports navigation/state to the parent through a channel-scoped envelope.
 *
 * Everything it reads from the page is inert `data-proto-*` markup; everything
 * it accepts from the parent is one validated `proto:init` state object.
 * Sensitive fields are never bound, stored or posted.
 */
export function studioPrototypeRuntimeScript(
	config: StudioPrototypeRuntimeConfig,
): string {
	const limits = {
		keys: STUDIO_PROTOTYPE_LIMITS.stateKeys,
		value: STUDIO_PROTOTYPE_LIMITS.stateValueChars,
		total: STUDIO_PROTOTYPE_LIMITS.stateTotalChars,
		message: STUDIO_PROTOTYPE_LIMITS.messageChars,
	};
	return `(() => {
const cfg = ${JSON.stringify({ ...config, limits }).replaceAll("<", "\\u003c")};
const root = document.documentElement;
root.style.visibility = 'hidden';
const parentWin = window.parent;
const post = message => parentWin.postMessage(Object.assign({ channel: cfg.channel, screenId: cfg.screenId }, message), cfg.origin);
const $$ = (selector, scope) => Array.from((scope || document).querySelectorAll(selector));
const keyPattern = /^[a-z][a-z0-9_-]{0,39}$/;
const attr = (node, name) => node.getAttribute(name);
const by = (name, value) => document.querySelector('[' + name + '=' + JSON.stringify(value) + ']');
const allBy = (name, value) => $$('[' + name + '=' + JSON.stringify(value) + ']');
let state = {};
let live = null;
let liveTimer = 0;
let opener = null;
let errorSeq = 0;
const errors = new Map();

function feedback(message, tone) {
 if (!live) {
  live = document.createElement('div');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('data-ev-feedback', '');
  live.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;max-width:min(92vw,420px);padding:10px 14px;border-radius:8px;font:500 14px/1.4 system-ui,sans-serif;background:#161718;color:#f7f8f8;border:1px solid #8a8f98';
  document.body.append(live);
 }
 live.style.borderColor = tone === 'danger' ? '#eb5757' : tone === 'success' ? '#27a644' : '#8a8f98';
 live.textContent = String(message).slice(0, cfg.limits.message);
 live.hidden = false;
 clearTimeout(liveTimer);
 liveTimer = setTimeout(() => { live.hidden = true; }, 4000);
}

function cleanState(raw) {
 const out = {};
 if (!raw || typeof raw !== 'object') return out;
 let count = 0;
 for (const key of Object.keys(raw)) {
  const value = raw[key];
  if (!keyPattern.test(key) || count >= cfg.limits.keys) continue;
  if (typeof value === 'string') out[key] = value.slice(0, cfg.limits.value);
  else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  else if (typeof value === 'boolean') out[key] = value;
  else continue;
  count += 1;
 }
 return out;
}
const bindNodes = $$('[data-proto-bind]').map(node => ({ node, key: attr(node, 'data-proto-bind') || '', fallback: node.textContent }));
const showNodes = $$('[data-proto-show-if]');
function renderBindings() {
 for (const item of bindNodes) item.node.textContent = item.key in state ? String(state[item.key]) : item.fallback;
 for (const node of showNodes) {
  const expr = attr(node, 'data-proto-show-if') || '';
  const at = expr.indexOf('=');
  const key = at < 0 ? expr : expr.slice(0, at);
  const want = at < 0 ? null : expr.slice(at + 1);
  const shown = want === null ? Boolean(state[key]) && state[key] !== 'false' : key in state && String(state[key]) === want;
  node.hidden = !shown;
 }
}
function setState(key, value) {
 if (!keyPattern.test(key)) return;
 const next = Object.assign({}, state);
 next[key] = typeof value === 'string' ? value.slice(0, cfg.limits.value) : value;
 if (Object.keys(next).length > cfg.limits.keys || JSON.stringify(next).length > cfg.limits.total) {
  feedback('Data contoh prototipe melebihi batas.', 'danger');
  return;
 }
 state = next;
 renderBindings();
 post({ type: 'proto:state', state });
}

function go(target) {
 if (!target || !target.screenId) { feedback('Halaman "' + (target ? target.requested : '') + '" tidak tersedia di prototipe ini.', 'danger'); return; }
 post({ type: 'proto:navigate', target: { screenId: target.screenId, requested: target.requested } });
}

const dialogs = () => $$('[data-proto-dialog]');
const openDialogs = () => dialogs().filter(node => !node.hidden);
const focusable = scope => $$('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])', scope).filter(node => !node.disabled && !node.hidden);
function openDialog(id) {
 const dialog = by('data-proto-dialog', id);
 if (!dialog) return;
 opener = document.activeElement;
 dialog.hidden = false;
 dialog.setAttribute('role', 'dialog');
 dialog.setAttribute('aria-modal', 'true');
 const first = focusable(dialog)[0];
 if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
 (first || dialog).focus();
}
function closeDialog(id) {
 const targets = id ? [by('data-proto-dialog', id)] : openDialogs();
 for (const dialog of targets) if (dialog) dialog.hidden = true;
 if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
 opener = null;
}

function selectTab(group, tab) {
 const triggers = $$('[data-proto-tab-group]').filter(node => attr(node, 'data-proto-tab-group') === group && node.hasAttribute('data-proto-tab'));
 for (const node of triggers) {
  const active = attr(node, 'data-proto-tab') === tab;
  node.setAttribute('aria-selected', String(active));
  node.setAttribute('tabindex', active ? '0' : '-1');
  if (!node.hasAttribute('role')) node.setAttribute('role', 'tab');
 }
 for (const panel of $$('[data-proto-tab-panel]')) {
  if (attr(panel, 'data-proto-tab-group') !== group) continue;
  panel.hidden = attr(panel, 'data-proto-tab-panel') !== tab;
  panel.setAttribute('role', 'tabpanel');
 }
}
function setRegion(id, open) {
 const region = by('data-proto-region', id);
 if (!region) return;
 const next = open === undefined ? region.hidden : open;
 region.hidden = !next;
 for (const node of $$('[data-ev-ix]')) {
  const ix = cfg.interactions[attr(node, 'data-ev-ix')];
  if (ix && (ix.type === 'expand' || ix.type === 'collapse' || ix.type === 'toggle') && ix.target === id) node.setAttribute('aria-expanded', String(next));
 }
}

const filters = {};
function applyFilter(id) {
 const collection = by('data-proto-collection', id);
 if (!collection) return;
 const current = filters[id] || { query: '', tag: '' };
 const items = $$('[data-proto-item]', collection);
 let shown = 0;
 for (const item of items) {
  const text = (item.textContent || '').toLowerCase() + ' ' + (attr(item, 'data-proto-keywords') || '').toLowerCase();
  const tags = (attr(item, 'data-proto-tags') || '').toLowerCase().split(/[\\s,]+/).filter(Boolean);
  const matches = (!current.query || text.includes(current.query)) && (!current.tag || tags.includes(current.tag));
  item.hidden = !matches;
  if (matches) shown += 1;
 }
 for (const empty of $$('[data-proto-empty]', collection)) empty.hidden = shown > 0;
 for (const count of allBy('data-proto-count', id)) count.textContent = String(shown);
 for (const node of $$('[data-ev-ix]')) {
  const ix = cfg.interactions[attr(node, 'data-ev-ix')];
  if (ix && ix.type === 'filter_collection' && ix.collection === id && ix.mode === 'tag') node.setAttribute('aria-pressed', String(Boolean(current.tag) && (ix.tag || '').toLowerCase() === current.tag));
 }
}

function clearErrors(scope) {
 for (const [field, entry] of Array.from(errors)) {
  if (scope && !scope.contains(field)) continue;
  entry.node.remove();
  field.removeAttribute('aria-invalid');
  if (entry.describedBy) field.setAttribute('aria-describedby', entry.describedBy); else field.removeAttribute('aria-describedby');
  errors.delete(field);
 }
}
function showError(field, message) {
 const node = document.createElement('p');
 node.id = 'ev-err-' + (errorSeq += 1);
 node.setAttribute('role', 'alert');
 node.setAttribute('data-ev-error', '');
 node.style.cssText = 'margin:4px 0 0;color:#eb5757;font:500 13px/1.4 system-ui,sans-serif';
 node.textContent = message;
 const describedBy = attr(field, 'aria-describedby');
 field.insertAdjacentElement('afterend', node);
 field.setAttribute('aria-invalid', 'true');
 field.setAttribute('aria-describedby', (describedBy ? describedBy + ' ' : '') + node.id);
 errors.set(field, { node, describedBy });
}
function invalidMessage(field) {
 const custom = attr(field, 'data-proto-error');
 if (custom) return custom;
 const v = field.validity;
 if (v.valueMissing) return 'Kolom ini wajib diisi.';
 if (v.typeMismatch) return 'Format isian tidak valid.';
 if (v.patternMismatch) return 'Isian tidak sesuai format yang diminta.';
 if (v.tooShort || v.rangeUnderflow) return 'Isian terlalu pendek atau terlalu kecil.';
 return field.validationMessage || 'Isian tidak valid.';
}
function validateForm(form) {
 clearErrors(form);
 let first = null;
 const seenGroups = new Set();
 for (const field of $$('input,select,textarea', form)) {
  if (field.type === 'hidden' || field.disabled) continue;
  if (field.type === 'radio') { if (seenGroups.has(field.name)) continue; seenGroups.add(field.name); }
  const blank = field.required && /^(?:text|search|email|tel|url|number)$/.test(field.type || 'text') && !String(field.value).trim();
  const group = field.type === 'radio' && field.name ? $$('input[type=radio]', form).filter(r => r.name === field.name) : [field];
  const ok = !blank && group.every(item => item.checkValidity() || (field.type === 'radio' && group.some(r => r.checked)));
  if (ok) continue;
  showError(field, blank ? (attr(field, 'data-proto-error') || 'Kolom ini wajib diisi.') : invalidMessage(field));
  if (!first) first = field;
 }
 if (first) first.focus();
 return !first;
}
const formNode = id => by('data-proto-form', id);
function formInteraction(id) {
 const all = Object.values(cfg.interactions);
 return all.find(ix => ix.type === 'submit_mock_form' && ix.form === id) || all.find(ix => ix.type === 'validate_form' && ix.form === id) || null;
}

function submit(ix, trigger) {
 const form = formNode(ix.form);
 if (!form || !validateForm(form)) return;
 if (ix.requiredState) {
  const missing = ix.requiredState.filter(key => !(key in state) || state[key] === '' || state[key] === false);
  if (missing.length) { feedback('Lengkapi pilihan yang dibutuhkan terlebih dahulu.', 'danger'); return; }
 }
 if (trigger) { trigger.disabled = true; trigger.setAttribute('aria-busy', 'true'); }
 setTimeout(() => {
  if (trigger) { trigger.disabled = false; trigger.removeAttribute('aria-busy'); }
  if (ix.stateOnSuccess) setState(ix.stateOnSuccess.key, ix.stateOnSuccess.value);
  if (ix.closeDialog) closeDialog(null);
  if (ix.feedback) feedback(ix.feedback, 'success');
  if (ix.success) go(ix.success); else if (typeof form.reset === 'function') form.reset();
 }, ix.simulateMs || 0);
}

function run(ix, node) {
 switch (ix.type) {
  case 'navigate': go({ screenId: ix.screenId, requested: ix.requested }); break;
  case 'back': post({ type: 'proto:back' }); break;
  case 'open_dialog': openDialog(ix.dialog); break;
  case 'close_dialog': closeDialog(ix.dialog); break;
  case 'select_tab': selectTab(ix.group, ix.tab); break;
  case 'expand': setRegion(ix.target, true); break;
  case 'collapse': setRegion(ix.target, false); break;
  case 'toggle': setRegion(ix.target); break;
  case 'set_mock_state': setState(ix.key, ix.value); break;
  case 'filter_collection': {
   const next = filters[ix.collection] || { query: '', tag: '' };
   if (ix.mode === 'tag') { const tag = (ix.tag || '').toLowerCase(); next.tag = next.tag === tag ? '' : tag; }
   else next.query = String(node && node.value || '').trim().toLowerCase();
   filters[ix.collection] = next;
   applyFilter(ix.collection);
   break;
  }
  case 'validate_form': { const form = formNode(ix.form); if (form) validateForm(form); break; }
  case 'submit_mock_form': submit(ix, node && node.localName === 'button' ? node : null); break;
  case 'show_feedback': feedback(ix.message, ix.tone); break;
 }
}
const interactionOf = node => {
 const holder = node instanceof Element ? node.closest('[data-ev-ix]') : null;
 const ix = holder ? cfg.interactions[attr(holder, 'data-ev-ix')] : null;
 return ix ? { ix, node: holder } : null;
};

document.addEventListener('click', event => {
 const hit = interactionOf(event.target);
 if (hit && !(hit.ix.type === 'filter_collection' && hit.ix.mode === 'search')) { event.preventDefault(); run(hit.ix, hit.node); return; }
 const submitter = !hit && event.target instanceof Element ? event.target.closest('button:not([type]),button[type=submit],input[type=submit]') : null;
 const owner = submitter ? submitter.closest('[data-proto-form]') : null;
 const owned = owner ? formInteraction(attr(owner, 'data-proto-form')) : null;
 if (submitter && owned) { event.preventDefault(); run(owned, submitter); return; }
 const dialog = event.target instanceof Element && event.target.hasAttribute('data-proto-dialog') ? event.target : null;
 if (dialog) { closeDialog(attr(dialog, 'data-proto-dialog')); return; }
 const link = event.target instanceof Element ? event.target.closest('a') : null;
 if (link && !hit) {
  const href = (attr(link, 'href') || '').trim();
  if (href === '' || href === '#') { event.preventDefault(); feedback('Tautan ini belum terhubung ke halaman prototipe.', 'info'); }
 }
}, true);
document.addEventListener('submit', event => {
 event.preventDefault();
 const form = event.target instanceof Element ? event.target.closest('[data-proto-form]') : null;
 const ix = form ? formInteraction(attr(form, 'data-proto-form')) : null;
 if (!form || !ix) return;
 run(ix, form.querySelector('button[type=submit],button:not([type])'));
}, true);
function bindInput(target) {
 if (!(target instanceof Element) || !target.hasAttribute('data-proto-bind-input') || target.hasAttribute('data-ev-sensitive')) return;
 const key = attr(target, 'data-proto-bind-input') || '';
 if (target.type === 'checkbox') setState(key, Boolean(target.checked));
 else if (target.type === 'radio') { if (target.checked) setState(key, target.value); }
 else setState(key, target.value);
}
document.addEventListener('input', event => {
 const target = event.target;
 const hit = interactionOf(target);
 if (hit && hit.ix.type === 'filter_collection' && hit.ix.mode === 'search') run(hit.ix, hit.node);
 if (target instanceof Element && errors.has(target)) { const entry = errors.get(target); entry.node.remove(); target.removeAttribute('aria-invalid'); if (entry.describedBy) target.setAttribute('aria-describedby', entry.describedBy); else target.removeAttribute('aria-describedby'); errors.delete(target); }
 bindInput(target);
}, true);
document.addEventListener('change', event => bindInput(event.target), true);
document.addEventListener('keydown', event => {
 const target = event.target;
 if (event.key === 'Escape' && openDialogs().length) { event.preventDefault(); closeDialog(null); return; }
 if (event.key === 'Tab') {
  const dialog = openDialogs()[0];
  if (dialog) {
   const items = focusable(dialog);
   if (!items.length) { event.preventDefault(); return; }
   const first = items[0]; const last = items[items.length - 1];
   if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return;
 }
 if ((event.key === 'Enter' || event.key === ' ') && target instanceof Element && target.hasAttribute('data-ev-ix') && !/^(?:a|button|input|select|textarea|summary)$/.test(target.localName)) {
  event.preventDefault();
  target.click();
  return;
 }
 if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && target instanceof Element && target.getAttribute('role') === 'tab') {
  const group = attr(target, 'data-proto-tab-group');
  const tabs = $$('[role=tab]').filter(node => attr(node, 'data-proto-tab-group') === group);
  const next = tabs[(tabs.indexOf(target) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  if (next) { event.preventDefault(); next.focus(); next.click(); }
 }
}, true);

function initialise(next) {
 state = cleanState(next);
 for (const dialog of dialogs()) dialog.hidden = true;
 for (const region of $$('[data-proto-region]')) { if (attr(region, 'data-proto-collapsed') === 'true') region.hidden = true; }
 for (const group of new Set($$('[data-proto-tab][data-proto-tab-group]').map(node => attr(node, 'data-proto-tab-group')))) {
  const triggers = $$('[data-proto-tab]').filter(node => attr(node, 'data-proto-tab-group') === group);
  const chosen = triggers.find(node => attr(node, 'aria-selected') === 'true') || triggers[0];
  if (chosen) selectTab(group, attr(chosen, 'data-proto-tab'));
 }
 for (const node of $$('[data-ev-ix]')) {
  const ix = cfg.interactions[attr(node, 'data-ev-ix')];
  if (ix && (ix.type === 'expand' || ix.type === 'collapse' || ix.type === 'toggle')) { const region = by('data-proto-region', ix.target); if (region) node.setAttribute('aria-expanded', String(!region.hidden)); }
 }
 for (const field of $$('[data-proto-bind-input]')) {
  if (field.hasAttribute('data-ev-sensitive')) continue;
  const key = attr(field, 'data-proto-bind-input') || '';
  if (!(key in state)) continue;
  if (field.type === 'checkbox') field.checked = Boolean(state[key]);
  else if (field.type === 'radio') field.checked = field.value === String(state[key]);
  else field.value = String(state[key]);
 }
 for (const id of new Set($$('[data-proto-collection]').map(node => attr(node, 'data-proto-collection')))) applyFilter(id);
 renderBindings();
 root.style.visibility = '';
}
let initialised = false;
window.addEventListener('message', event => {
 const data = event.data;
 if (initialised || event.source !== parentWin || !data || data.type !== 'proto:init' || data.channel !== cfg.channel) return;
 initialised = true;
 initialise(data.state);
});
setTimeout(() => { if (!initialised) { initialised = true; initialise({}); } }, 2500);
Promise.all([
 document.fonts ? document.fonts.ready : null,
 ...Array.from(document.images, image => image.complete ? null : new Promise(done => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); })),
]).then(() => post({ type: 'proto:ready' }), () => post({ type: 'proto:ready' }));
})();`;
}
