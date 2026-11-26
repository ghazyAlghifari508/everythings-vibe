// This runs only inside the nonce-authorized, opaque-origin renderer.
export const studioInlineTextScript = `
let editing = null;
const textEnd = 'studio:element:text-end';
const sendText = (type, elementId, session, details = {}) => post(type, {elementId, session, ...details});
const finishText = (commit, restoreFocus = false) => {
 const current = editing;
 if (!current) return;
 editing = null;
 const {host, original, value, owner, elementId, session} = current;
 const draft = ((host.childElementCount ? host.innerText : host.textContent) ?? '').replace(/\\r\\n?/g, '\\n');
 host.replaceWith(original);
 if (restoreFocus && owner.isConnected) owner.focus({preventScroll:true});
 if (commit && draft.length > 8000) sendText(textEnd, elementId, session, {reason:'too-long'});
 else if (commit && draft !== value) sendText('studio:element:text-commit', elementId, session, {text:draft});
 else sendText(textEnd, elementId, session, {reason:'closed'});
 update();
};
const setTextSelection = (host, selectAll) => {
 const selection = getSelection();
 if (!selection) return;
 const range = document.createRange();
 range.selectNodeContents(host);
 if (!selectAll) range.collapse(false);
 selection.removeAllRanges();
 selection.addRange(range);
};
const insertPlainText = (host, text) => {
 const selection = getSelection();
 if (!selection || !selection.rangeCount) return;
 const range = selection.getRangeAt(0);
 if (!host.contains(range.commonAncestorContainer)) return;
 if (text.includes('\\n')) host.style.whiteSpace = 'pre-wrap';
 // Native insertText participates in the platform's editing undo stack.
 if (document.execCommand?.('insertText', false, text)) return;
 range.deleteContents();
 const node = document.createTextNode(text);
 range.insertNode(node);
 range.setStartAfter(node);
 range.collapse(true);
 selection.removeAllRanges();
 selection.addRange(range);
};
const startText = (elementId, session) => {
 if (editing) finishText(false);
 const owner = selected;
 const nodes = owner ? Array.from(owner.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.data.trim()) : [];
 if (!owner || !isVisible(owner) || owner.getAttribute(inspectAttr) !== elementId || !owner.hasAttribute('data-ev-edit-text') || nodes.length !== 1) {
  sendText(textEnd, elementId, session, {reason:'unavailable'});
  return;
 }
 const original = nodes[0];
 const host = document.createElement('span');
 host.setAttribute('contenteditable', 'plaintext-only');
 host.setAttribute('role', 'textbox');
 host.setAttribute('aria-label', 'Teks elemen');
 host.setAttribute('aria-multiline', 'true');
 host.setAttribute('aria-keyshortcuts', 'Enter Shift+Enter Escape Tab');
 host.setAttribute('tabindex', '0');
 host.style.userSelect = 'text';
 host.style.cursor = 'text';
 host.append(document.createTextNode(original.data));
 editing = {host, original, value:original.data, owner, elementId, session, composing:false};
 original.replaceWith(host);
 host.focus({preventScroll:true});
 setTextSelection(host, false);
 host.addEventListener('compositionstart', () => { if (editing?.host === host) editing.composing = true; });
 host.addEventListener('compositionend', () => { if (editing?.host === host) editing.composing = false; });
 host.addEventListener('blur', () => { if (editing?.host === host) finishText(!editing.composing); });
 host.addEventListener('paste', event => {
  event.preventDefault();
  if (!editing?.composing) insertPlainText(host, (event.clipboardData?.getData('text/plain') ?? '').replace(/\\r\\n?/g, '\\n'));
 });
 host.addEventListener('dragover', event => event.preventDefault());
 host.addEventListener('drop', event => event.preventDefault());
 host.addEventListener('beforeinput', event => {
  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
   event.preventDefault();
   if (!editing?.composing) insertPlainText(host, '\\n');
  }
 });
 sendText('studio:element:text-started', elementId, session);
};
const textKey = event => {
 if (!editing || !editing.host.contains(event.target)) return false;
 if (editing.composing || event.isComposing || event.keyCode === 229) return true;
 if (event.key === 'Escape') {
  event.preventDefault();
  finishText(false, true);
 } else if (event.key === 'Enter') {
  event.preventDefault();
  if (event.shiftKey) insertPlainText(editing.host, '\\n');
  else finishText(true, true);
 } else if (event.key === 'Tab') {
  finishText(true, true);
 } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
  event.preventDefault();
  setTextSelection(editing.host, true);
 }
 return true;
};
window.addEventListener('message', event => {
 const data = event.data;
 if (event.source !== parent || event.origin !== origin || !data || typeof data !== 'object') return;
 if (Object.keys(envelope).some(key => data[key] !== envelope[key])) return;
 if (typeof data.session !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.session) || typeof data.elementId !== 'string') return;
 if (data.type === 'studio:element:text-start') startText(data.elementId, data.session);
 else if (data.type === 'studio:element:text-cancel' && editing?.session === data.session && editing.elementId === data.elementId) finishText(false);
});
`;
