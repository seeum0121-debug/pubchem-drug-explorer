const models = new Map();
const cache = new Map();
export async function translate(text, sourceLanguage, targetLanguage, onState = () => {}) {
  if (!globalThis.Translator) throw new Error('이 Chrome에서 기본 Translator API를 사용할 수 없습니다. 영어 입력과 원문 조회는 가능합니다.');
  const pair = `${sourceLanguage}:${targetLanguage}`;
  const key = `${pair}:${text}`;
  if (cache.has(key)) { onState('준비 완료 (세션 캐시)'); return cache.get(key); }
  const options = { sourceLanguage, targetLanguage };
  if (!models.has(pair)) {
    const availability = await Translator.availability(options);
    if (availability === 'unavailable') throw new Error('해당 언어의 번역 모델을 사용할 수 없습니다.');
    onState(availability === 'available' ? '모델 준비 중' : '번역 모델 다운로드 중 — 최초 실행은 시간이 걸릴 수 있습니다.');
    const model = await Translator.create({ ...options, monitor(m) {
      m.addEventListener('downloadprogress', e => onState(`모델 다운로드 ${Math.round(e.loaded * 100)}%`));
    } });
    models.set(pair, model);
  }
  onState('번역 중');
  const result = await models.get(pair).translate(text);
  cache.set(key, result);
  onState('준비 완료');
  return result;
}
