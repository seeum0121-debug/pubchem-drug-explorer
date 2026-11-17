const models = new Map();
const cache = new Map();
let queue = Promise.resolve();

export function prepareTranslator(sourceLanguage, targetLanguage, onState = () => {}) {
  const pair = `${sourceLanguage}:${targetLanguage}`;
  const existing = models.get(pair);
  if (existing) {
    if (!existing.ready) existing.listeners.add(onState);
    onState(existing.state);
    return existing.promise;
  }
  const entry = {listeners: new Set([onState]), state: '번역 모델 준비 중 — 최초 실행은 다운로드가 필요할 수 있습니다.', ready: false};
  const notify = message => {
    entry.state = message;
    for (const listener of entry.listeners) listener(message);
  };
  notify(entry.state);
  let creation;
  try {
    if (!globalThis.Translator) throw new Error('이 Chrome에서 기본 Translator API를 사용할 수 없습니다. 영어 입력과 원문 조회는 가능합니다.');
    // Keep create in the product-click activation stack: never await availability here.
    creation = globalThis.Translator.create({sourceLanguage, targetLanguage, monitor(m) {
      notify('번역 모델 다운로드 중 — 최초 실행은 시간이 걸릴 수 있습니다.');
      m.addEventListener('downloadprogress', e => notify(`모델 다운로드 ${Math.round(e.loaded * 100)}%`));
    }});
  } catch (error) {
    creation = Promise.reject(error);
  }
  entry.promise = Promise.resolve(creation).then(model => {
    entry.ready = true;
    notify('번역 모델 준비 완료');
    entry.listeners.clear();
    return model;
  }, error => {
    if (models.get(pair) === entry) models.delete(pair);
    entry.listeners.clear();
    throw error;
  });
  models.set(pair, entry);
  return entry.promise;
}

export async function translate(text, sourceLanguage, targetLanguage, onState = () => {}) {
  const key = `${sourceLanguage}:${targetLanguage}:${text}`;
  if (cache.has(key)) { onState('준비 완료 (세션 캐시)'); return cache.get(key); }
  const model = await prepareTranslator(sourceLanguage, targetLanguage, onState);
  const work = queue.then(async () => {
    if (cache.has(key)) { onState('준비 완료 (세션 캐시)'); return cache.get(key); }
    onState('번역 중');
    const result = await model.translate(text);
    cache.set(key, result);
    onState('준비 완료');
    return result;
  });
  queue = work.catch(() => {});
  return work;
}
