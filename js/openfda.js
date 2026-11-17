import { requestJSON } from './http.js';
import { linkProducts } from './identity.js';

const ROOT = 'https://api.fda.gov/drug';
const PAGE_SIZE = 20;

function queryUrl(endpoint, field, value, limit, skip) {
  // FDA query-language quoting is separate from URL percent encoding.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const url = new URL(`${ROOT}/${endpoint}.json`);
  url.searchParams.set('search', `${field}:"${escaped}"`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('skip', String(skip));
  return url.href;
}

function page(data, sourceUrl) {
  if (!Array.isArray(data.results) || !Number.isSafeInteger(data.meta?.results?.total) || data.meta.results.total < 0) {
    throw new Error('openFDA returned an invalid results page.');
  }
  if (data.results.some(record => !record || typeof record !== 'object' || Array.isArray(record))) {
    throw new Error('openFDA returned an invalid record.');
  }
  return {
    records: data.results.map(record => ({ ...record, _sourceUrl: sourceUrl, _retrievedAt: data._retrievedAt })),
    total: data.meta.results.total,
  };
}

export async function findProducts(compound, uniiEvidence, { skip = 0, signal } = {}) {
  const cid = compound?.CID;
  if (!Number.isSafeInteger(cid) || cid <= 0 || Number(uniiEvidence?.cid) !== cid) throw new Error('Compound and UNII evidence identities do not match.');
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > 25000) throw new Error('Invalid openFDA page offset.');
  const evidence = Array.isArray(uniiEvidence?.uniis) ? uniiEvidence.uniis : [];
  const uniis = [...new Set(evidence.filter(item => /^[A-Z0-9]{10}$/.test(item?.value || '') && item.provider && item.sourceUrl?.startsWith('https://')).map(item => item.value))];
  if (uniis.length !== 1 || !uniiEvidence.retrievedAt) throw new Error('One unambiguous, sourced PubChem UNII is required; name-only linking is not allowed.');
  const sourceUrl = queryUrl('label', 'openfda.unii', uniis[0], PAGE_SIZE, skip);
  let labelPage;
  try {
    labelPage = page(await requestJSON(sourceUrl, { signal }), sourceUrl);
  } catch (error) {
    if (error.status !== 404 || error.code !== 'NOT_FOUND') throw error;
    return { products: [], held: [], total: 0, nextSkip: null, labels: [], ndcs: [], lookupHeld: [] };
  }
  if (labelPage.records.length > PAGE_SIZE || (!labelPage.records.length && skip < labelPage.total)) throw new Error('openFDA returned an inconsistent label page.');
  const productNdcs = new Set();
  for (const label of labelPage.records) {
    for (const value of Array.isArray(label.openfda?.product_ndc) ? label.openfda.product_ndc : []) {
      if (typeof value === 'string' && /^\d{4,5}-\d{1,4}$/.test(value)) productNdcs.add(value);
    }
  }
  const ndcs = [];
  const lookupHeld = [];
  for (const productNdc of productNdcs) {
    let ndcSkip = 0;
    let total;
    const exactRecords = [];
    do {
      if (ndcSkip > 25000) throw new Error('NDC exact-match results exceed the openFDA paging limit.');
      const ndcUrl = queryUrl('ndc', 'product_ndc', productNdc, 100, ndcSkip);
      let ndcPage;
      try {
        ndcPage = page(await requestJSON(ndcUrl, { signal }), ndcUrl);
      } catch (error) {
        if (error.status !== 404 || error.code !== 'NOT_FOUND') throw error;
        // A partially retrieved exact-NDC set cannot establish absence of conflicts.
        exactRecords.length = 0;
        lookupHeld.push({
          cid, product_ndc: productNdc, selectionKey: null,
          reason: `Exact NDC lookup returned NOT_FOUND: ${error.message}`,
          error: { status: error.status, code: error.code },
          provenance: { provider: 'openFDA', endpoint: `${ROOT}/ndc.json`,
            sourceUrl: ndcUrl, fieldPath: 'product_ndc', recordId: productNdc,
            retrievedAt: new Date().toISOString() },
        });
        break;
      }
      total = ndcPage.total;
      if (!ndcPage.records.length && ndcSkip < total) throw new Error('openFDA returned an incomplete NDC page.');
      exactRecords.push(...ndcPage.records.filter(record => record.product_ndc === productNdc));
      ndcSkip += ndcPage.records.length;
    } while (ndcSkip < total);
    ndcs.push(...exactRecords);
  }
  const linked = linkProducts(cid, uniiEvidence, labelPage.records, ndcs);
  const next = skip + labelPage.records.length;
  return { ...linked, held: [...linked.held, ...lookupHeld], total: labelPage.total,
    nextSkip: next < labelPage.total && next <= 25000 ? next : null,
    labels: labelPage.records, ndcs, lookupHeld };
}
