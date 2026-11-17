const array = value => Array.isArray(value) ? value : [];
const strings = value => array(value).filter(item => typeof item === 'string' && item.length > 0);
const unique = value => [...new Set(strings(value))];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter(key => !key.startsWith('_')).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function source(record, endpoint, path, recordId) {
  return {
    provider: 'openFDA', endpoint, sourceUrl: record._sourceUrl || null,
    fieldPath: path, recordId: recordId || null, retrievedAt: record._retrievedAt || null,
  };
}

function fieldSources(record, prefix, endpoint, recordId) {
  const fields = {};
  function visit(value, path) {
    if (path) fields[`${prefix}.${path}`] = source(record, endpoint, path, recordId);
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`));
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (!key.startsWith('_')) visit(child, path ? `${path}.${key}` : key);
      }
    }
  }
  visit(record, '');
  return fields;
}

export function linkProducts(cid, uniiEvidence, labels, ndcs) {
  if (!Number.isSafeInteger(Number(cid)) || Number(cid) <= 0) throw new Error('Invalid compound identity.');
  if (!Array.isArray(labels) || !Array.isArray(ndcs)) throw new Error('Expected label and NDC record arrays.');
  const products = new Map();
  const signatures = new Map();
  const blocked = new Set();
  const held = [];
  const evidence = array(uniiEvidence?.uniis).filter(item =>
    /^[A-Z0-9]{10}$/.test(item?.value || '') && typeof item.provider === 'string' && item.provider && typeof item.sourceUrl === 'string' && item.sourceUrl.startsWith('https://'));
  const selectedUniis = [...new Set(evidence.map(item => item.value))];
  const validEvidence = Number(uniiEvidence?.cid) === Number(cid) && selectedUniis.length === 1 && Boolean(uniiEvidence?.retrievedAt);
  const linkEvidence = {
    cid: Number(cid), uniis: evidence, provider: 'PubChem',
    endpoint: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/',
    fieldPath: 'Record.Section.UNII.Information', recordId: Number(cid),
    sourceUrl: uniiEvidence?.sourceUrl || null, retrievedAt: uniiEvidence?.retrievedAt || null,
  };
  function hold(label, ndc, reason, selectionKey = null) {
    held.push({ cid: Number(cid), product_ndc: ndc?.product_ndc || null, set_id: label?.set_id || null,
      label_id: label?.id || null, selectionKey, reason, provenance: { identity: linkEvidence,
        ndc: ndc ? source(ndc, 'https://api.fda.gov/drug/ndc.json', 'product_ndc', ndc.product_ndc) : null,
        label: label ? source(label, 'https://api.fda.gov/drug/label.json', 'id', label.id) : null } });
    if (selectionKey) { blocked.add(selectionKey); products.delete(selectionKey); }
  }
  for (const label of labels) {
    if (!label || typeof label !== 'object') { hold(null, null, 'Invalid label record.'); continue; }
    const productNdcs = unique(label.openfda?.product_ndc);
    if (!label.id || !label.set_id || !productNdcs.length) {
      hold(label, null, 'Missing label ID, set ID, or product NDC.');
      continue;
    }
    for (const productNdc of productNdcs) {
      const selectionKey = JSON.stringify([productNdc, label.set_id, label.id]);
      const matches = ndcs.filter(ndc => ndc?.product_ndc === productNdc);
      if (!matches.length) { hold(label, { product_ndc: productNdc }, 'No exact NDC record was returned.', selectionKey); continue; }
      for (const ndc of matches) {
        if (ndc.spl_id !== label.id || !strings(ndc.openfda?.spl_set_id).includes(label.set_id)) {
          hold(label, ndc, 'NDC SPL version or set ID does not exactly match the label.', selectionKey);
          continue;
        }
        if (!validEvidence) {
          hold(label, ndc, 'Missing, conflicting, or unsourced CID–UNII evidence.', selectionKey);
          continue;
        }
        const ingredients = array(ndc.active_ingredients);
        const ndcUniis = unique(ndc.openfda?.unii);
        if (ingredients.length !== 1) {
          hold(label, ndc, ingredients.length ? 'Combination product: no direct ingredient-to-UNII mapping; array position and names are not evidence.' : 'Missing active ingredient composition.', selectionKey);
          continue;
        }
        if (!ingredients[0]?.name || ndcUniis.length !== 1 || ndcUniis[0] !== selectedUniis[0]) {
          hold(label, ndc, 'Active ingredient composition or exact UNII conflicts with the selected compound; salt equivalence is not inferred.', selectionKey);
          continue;
        }
        const signature = JSON.stringify(canonical({ ndc, label }));
        if (signatures.has(selectionKey) && signatures.get(selectionKey) !== signature) {
          hold(label, ndc, 'Conflicting records have the same product/label selection key.', selectionKey);
          continue;
        }
        signatures.set(selectionKey, signature);
        if (blocked.has(selectionKey) || products.has(selectionKey)) continue;
        products.set(selectionKey, {
          selectionKey, ndc, label,
          sharedLabel: productNdcs.length > 1,
          provenance: {
            identity: { ...linkEvidence, reason: 'Exact sourced CID–UNII matches a single-ingredient NDC; product NDC, SPL version, and set ID match the owning label.' },
            fields: {
              ...fieldSources(ndc, 'ndc', 'https://api.fda.gov/drug/ndc.json', ndc.product_ndc),
              ...fieldSources(label, 'label', 'https://api.fda.gov/drug/label.json', label.id),
            },
          },
        });
      }
    }
  }
  return { products: [...products.values()], held };
}
