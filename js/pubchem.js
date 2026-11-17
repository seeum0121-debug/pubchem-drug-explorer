import { requestJSON } from './http.js';

const ROOT = 'https://pubchem.ncbi.nlm.nih.gov';
const PROPERTIES = 'Title,MolecularFormula,MolecularWeight,IUPACName,ConnectivitySMILES,XLogP';

function validCid(cid) {
  if (!/^[1-9]\d*$/.test(String(cid)) || !Number.isSafeInteger(Number(cid))) throw new Error('Invalid PubChem CID.');
  return Number(cid);
}

function compounds(data, sourceUrl) {
  const rows = data.PropertyTable?.Properties;
  if (!Array.isArray(rows) || !rows.length) throw new Error('PubChem returned no compound properties.');
  return rows.map(row => {
    const CID = validCid(row.CID);
    const result = { CID, sourceUrl, retrievedAt: data._retrievedAt };
    for (const field of PROPERTIES.split(',')) result[field] = row[field] ?? null;
    return result;
  });
}

export async function searchCompounds(name, { signal } = {}) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Enter a compound name.');
  if (name.trim().length > 300) throw new Error('Compound name is too long.');
  const sourceUrl = `${ROOT}/rest/pug/compound/name/${encodeURIComponent(name.trim())}/property/${PROPERTIES}/JSON`;
  try {
    return compounds(await requestJSON(sourceUrl, { signal }), sourceUrl);
  } catch (error) {
    if (error.status === 404 && error.code === 'PUGREST.NotFound') return [];
    throw error;
  }
}

export async function getCompound(cid, { signal } = {}) {
  const id = validCid(cid);
  const sourceUrl = `${ROOT}/rest/pug/compound/cid/${id}/property/${PROPERTIES}/JSON`;
  const rows = compounds(await requestJSON(sourceUrl, { signal }), sourceUrl);
  if (rows.length !== 1 || rows[0].CID !== id) throw new Error('PubChem returned a different compound identity.');
  return rows[0];
}

export async function getUnii(cid, { signal } = {}) {
  const id = validCid(cid);
  const sourceUrl = `${ROOT}/rest/pug_view/data/compound/${id}/JSON?heading=UNII`;
  const data = await requestJSON(sourceUrl, { signal });
  if (data.Record?.RecordNumber !== id || !Array.isArray(data.Record.Section)) throw new Error('Invalid PubChem UNII annotation response.');
  const references = new Map((data.Record.Reference || []).map(reference => [reference.ReferenceNumber, reference]));
  const uniis = [];
  function visit(sections) {
    for (const section of sections) {
      if (section.TOCHeading === 'UNII') {
        for (const info of section.Information || []) {
          const reference = references.get(info.ReferenceNumber);
          if (!reference?.SourceName) continue;
          for (const item of info.Value?.StringWithMarkup || []) {
            const value = item.String?.trim();
            if (!/^[A-Z0-9]{10}$/.test(value || '')) continue;
            if (!uniis.some(existing => existing.value === value && existing.provider === reference.SourceName)) {
              uniis.push({ value, provider: reference.SourceName, sourceUrl, annotationUrl: info.URL || reference.URL || null });
            }
          }
        }
      }
      visit(section.Section || []);
    }
  }
  visit(data.Record.Section);
  return { cid: id, uniis, sourceUrl, retrievedAt: data._retrievedAt };
}
