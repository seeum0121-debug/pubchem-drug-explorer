export const $ = selector => document.querySelector(selector);
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
export function link(text, url) {
  const node = el('a', text);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['pubchem.ncbi.nlm.nih.gov', 'api.fda.gov', 'dailymed.nlm.nih.gov'].includes(parsed.hostname)) throw new Error('허용되지 않은 출처 URL');
  node.href = parsed.href; node.target = '_blank'; node.rel = 'noopener noreferrer';
  return node;
}
export function field(parent, title, value) {
  const row = el('div', undefined, 'field');
  row.append(el('dt', title), el('dd', value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length) ? '자료 없음' : Array.isArray(value) ? value.join(' · ') : value));
  parent.append(row);
}
export function compoundCard(compound) {
  const card = el('article', undefined, 'card');
  card.append(el('h2', compound.Title || '성분명 자료 없음'));
  const image = el('img'); image.alt = `CID ${compound.CID} 화학 구조`;
  image.src = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${compound.CID}/PNG`;
  image.width = 240; image.height = 180;
  image.addEventListener('error', () => image.replaceWith(el('p', '구조 이미지 조회 실패')));
  card.append(image);
  const fields = el('dl');
  field(fields, 'CID', compound.CID); field(fields, '분자식', compound.MolecularFormula); field(fields, '분자량', compound.MolecularWeight);
  card.append(fields, link('PubChem 원자료', `https://pubchem.ncbi.nlm.nih.gov/compound/${compound.CID}`));
  return card;
}
export function status(node, text, error = false) { node.textContent = text; node.classList.toggle('error', error); }
export function validCid(value) { return /^[1-9]\d{0,9}$/.test(String(value)); }
export class Generation {
  value = 0;
  controller;
  next() { this.controller?.abort(); this.controller = new AbortController(); const value = ++this.value; return {signal:this.controller.signal, current:()=>value === this.value}; }
}
