import {searchCompounds} from './pubchem.js';
import {translate} from './translator.js';
import {$,el,compoundCard,status,Generation} from './render.js';
const generation = new Generation();
async function search(name, request) {
  status($('#status'), 'PubChem 조회 중…');
  try {
    const compounds = await searchCompounds(name, {signal:request.signal});
    if (!request.current()) return;
    $('#results').replaceChildren();
    status($('#status'), compounds.length ? `${compounds.length}개 후보 — CID와 구조를 확인한 후 선택하세요.` : '검색 결과 없음. 철자 또는 영문 성분명을 확인하세요.');
    for (const compound of compounds) {
      const card = compoundCard(compound, {signal:request.signal});
      const confirm = el('a','성분·구조 확인 완료 → 상세 보기','button');
      confirm.href = `./detail.html?cid=${encodeURIComponent(compound.CID)}`;
      card.append(confirm); $('#results').append(card);
    }
  } catch (error) { if(request.current()) status($('#status'),error.message,true); }
}
$('#search-form').addEventListener('submit', async event => {
  event.preventDefault();
  const request = generation.next();
  const name = $('#query').value.trim();
  $('#results').replaceChildren(); $('#translation').hidden = true;
  if (!name) {status($('#status'),'성분명을 입력하세요.',true);return;}
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(name)) {
    try {
      const translated = await translate(name,'ko','en', text => {if(request.current()) status($('#status'),text);});
      if (!request.current()) return;
      $('#original').textContent = `원입력: ${name}`; $('#candidate').value = translated;
      $('#translation').hidden = false; status($('#status'),'번역은 화합물 식별 근거가 아닙니다. 후보를 확인하세요.');
    } catch(error) {if(request.current()) status($('#status'),error.message,true);}
  } else await search(name,request);
});
$('#confirm-translation').addEventListener('click', () => {
  const name = $('#candidate').value.trim();
  if(!name) {status($('#status'),'영문 후보를 입력하세요.',true);return;}
  $('#results').replaceChildren(); search(name,generation.next());
});
