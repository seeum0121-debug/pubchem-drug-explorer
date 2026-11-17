import {getCompound,getUnii} from './pubchem.js';
import {findProducts} from './openfda.js';
import {linkProducts} from './identity.js';
import {prepareTranslator,translate} from './translator.js';
import {$,el,field,link,compoundCard,status,validCid,Generation} from './render.js';
const requests = new Generation(), selection = new Generation();
const compoundLifetime = new AbortController();
window.addEventListener('pagehide', () => compoundLifetime.abort(), {once:true});
let compound, evidence, skip = 0;
const products = new Map();
let labels = [], ndcs = [], lookupHeld = [];
const sections = [
  ['경고 · 먼저 확인하세요','warnings'],
  ['이상반응 (ADR)','adverse_reactions'],
  ['작용 기전 설명','mechanism_of_action'],
  ['작용 기전 분류','openfda.pharm_class_moa'],
  ['임상 약리 설명','clinical_pharmacology'],
  ['약리 효과 분류','openfda.pharm_class_pe']
];
function source(parent,title,url) {if(url) parent.append(link(title,url));}
function select(product) {
  const request = selection.next();
  const state = el('p',undefined,'translation-state');
  state.setAttribute('role','status');
  const prepared = prepareTranslator('en','ko',message=>{if(request.current())status(state,message);});
  const root = $('#label'); root.replaceChildren();
  const {ndc,label,selectionKey} = product;
  const current = () => request.current() && root.dataset.selectionKey===selectionKey;
  root.dataset.selectionKey = selectionKey;
  for(const button of $('#products').children) button.setAttribute('aria-pressed',String(button.dataset.selectionKey===selectionKey));
  root.setAttribute('aria-busy','true');
  root.append(el('h2',ndc.brand_name || ndc.generic_name || '제품명 자료 없음'),el('p','미국 openFDA · 선택한 NDC 제품에 연결된 정확한 SPL 라벨'));
  const details = el('dl');
  for(const [title,value] of [['제품명',ndc.brand_name],['일반명',ndc.generic_name],['전체 성분 / 함량',ndc.active_ingredients?.map(x=>`${x.name ?? '자료 없음'} / ${x.strength ?? '자료 없음'}`)],['제형',ndc.dosage_form],['경로',ndc.route]]) field(details,title,value);
  root.append(details,state);
  if(product.sharedLabel) root.append(el('p','공유 라벨: 여러 NDC 제품에 연결됩니다. 아래 문장은 이 제형만의 설명으로 재해석하지 않습니다.','notice'));
  const provenance = $('#selected-evidence');provenance.replaceChildren(el('h3','선택 제품 출처·식별 근거'));
  const evidenceFields = el('dl');
  for(const [title,value] of [['NDC',ndc.product_ndc],['SPL set_id',label.set_id],['라벨 버전 id',label.id],['원자료 날짜 (effective_time)',label.effective_time],['제품 조회 시각',ndc._retrievedAt],['라벨 조회 시각',label._retrievedAt]]) field(evidenceFields,title,value);
  provenance.append(evidenceFields,el('pre',JSON.stringify(product.provenance,null,2)));
  source(provenance,'NDC 제품 원자료',ndc._sourceUrl);source(provenance,'SPL 라벨 원자료',label._sourceUrl);
  const pending = [];
  for(const [title,path] of sections) {
    const value = path.split('.').reduce((v,key)=>v?.[key],label);
    const text = Array.isArray(value) ? value.join('\n\n') : value;
    provenance.append(el('p',`${title}: ${path} · label ${label.id}`));
    const section = el('article',undefined,'card');section.append(el('h3',title));
    if(!text?.trim()) {section.append(el('p','자료 없음 — 다른 항목이나 다른 제품의 설명으로 대체하지 않습니다.'));root.append(section);continue;}
    const translated = el('p','한국어 자동 번역 대기 중…','translation-text');
    const original = el('details');original.append(el('summary','영문 원문 보기'),el('p',text,'source-text'));
    section.append(translated,original);root.append(section);
    pending.push({title,text,translated,original});
  }
  root.tabIndex = -1;
  root.focus({preventScroll:true});
  root.scrollIntoView({block:'start'});
  void (async()=>{
    try {
      await prepared;
      if(!current())return;
    } catch(error) {
      if(current()) {
        status(state,`한국어 번역 실패: ${error.message} 영문 원문을 펼쳐 확인하세요.`,true);
        for(const item of pending) {
          status(item.translated,'한국어 번역을 사용할 수 없습니다. 영문 원문을 확인하세요.',true);
          item.original.open=true;
        }
        root.setAttribute('aria-busy','false');
      }
      return;
    }
    let failures = 0;
    for(const {title,text,translated,original} of pending) {
      if(!current())return;
      try {
        const result=await translate(text,'en','ko',message=>{if(current())status(state,`${title}: ${message}`);});
        if(current())status(translated,result);
      } catch(error) {
        failures++;
        if(current()) {
          status(translated,`한국어 번역 실패: ${error.message} 영문 원문을 확인하세요.`,true);
          original.open=true;
        }
      }
    }
    if(current())status(state,failures?`한국어 번역 ${failures}개 항목 실패 — 해당 영문 원문을 확인하세요.`:pending.length?'한국어로 표시했습니다.':'번역할 원문 자료가 없습니다.',failures>0);
    if(current())root.setAttribute('aria-busy','false');
  })();
}
async function loadProducts() {
  const request=requests.next();$('#more').hidden=true;$('#confirm-compound').disabled=true;
  status($('#status'),'성분 식별 근거 및 제품 조회 중…');
  try {
    if(!evidence) evidence=await getUnii(compound.CID,{signal:request.signal});
    if(!request.current())return;
    const identity=$('#identity');identity.hidden=false;identity.replaceChildren(el('h2','CID–UNII 출처 근거'),el('pre',JSON.stringify(evidence,null,2)));
    const result=await findProducts(compound,evidence,{skip,signal:request.signal});
    if(!request.current())return;
    labels.push(...result.labels); ndcs.push(...result.ndcs); lookupHeld.push(...result.lookupHeld);
    const cumulative=linkProducts(compound.CID,evidence,labels,ndcs);
    const activeKey=$('#label').dataset.selectionKey;
    if(activeKey && !cumulative.products.some(p=>p.selectionKey===activeKey)){selection.next();$('#label').replaceChildren();$('#selected-evidence').replaceChildren();delete $('#label').dataset.selectionKey;}
    products.clear(); $('#products').replaceChildren(); $('#held').replaceChildren();
    for(const product of cumulative.products) {
      if(products.has(product.selectionKey))continue;
      products.set(product.selectionKey,product);
      const n=product.ndc;
      const button=el('button',undefined,'product');
      button.dataset.selectionKey=product.selectionKey;
      button.setAttribute('aria-pressed',String(product.selectionKey===activeKey));
      button.append(el('strong',n.brand_name || n.generic_name || '제품명 자료 없음','product-name'),el('span',n.active_ingredients?.map(x=>`${x.name || '성분 자료 없음'} ${x.strength || '함량 자료 없음'}`).join(' + ') || '성분 자료 없음','product-ingredients'),el('span',`${n.dosage_form || '제형 자료 없음'} · ${n.route?.join(', ') || '경로 자료 없음'}`,'product-meta'));
      button.addEventListener('click',()=>select(product));$('#products').append(button);
    }
    for(const item of [...cumulative.held,...lookupHeld]) $('#held').append(el('p',typeof item==='string'?item:JSON.stringify(item)));
    skip=result.nextSkip;$('#more').hidden=skip===null || skip===undefined;
    status($('#status'),`${products.size}개 연결 제품. ${cumulative.held.length+lookupHeld.length}건 보류. ${products.size?'제품을 선택하세요.':'연결 근거가 충분한 제품이 없습니다.'}`);
  } catch(error) {
    if(request.current()) {
      status($('#status'),error.message,true);
      $('#more').hidden=!(skip > 0);
    }
  }
  finally {if(request.current())$('#confirm-compound').disabled=false;}
}
$('#confirm-compound').addEventListener('click',()=>{skip=0;labels=[];ndcs=[];lookupHeld=[];products.clear();$('#products').replaceChildren();$('#held').replaceChildren();selection.next();$('#label').replaceChildren();$('#selected-evidence').replaceChildren();delete $('#label').dataset.selectionKey;loadProducts();});
$('#more').addEventListener('click',loadProducts);
const cid=new URLSearchParams(location.search).get('cid');
if(!validCid(cid)) status($('#status'),'유효하지 않은 CID입니다. 검색 화면에서 성분을 선택하세요.',true);
else {
  try {
    compound=await getCompound(cid,{signal:compoundLifetime.signal});
    const card=compoundCard(compound,{signal:compoundLifetime.signal}), fields=el('dl');
    for(const [title,value] of [['IUPAC명',compound.IUPACName],['SMILES',compound.ConnectivitySMILES],['XLogP',compound.XLogP],['조회 시각',compound.retrievedAt]])field(fields,title,value);
    const chemicalDetails=el('details');chemicalDetails.append(el('summary','화학 상세 정보'),fields);
    card.append(chemicalDetails);$('#compound').append(card);$('#confirm-compound').hidden=false;
    status($('#status'),'CID와 구조를 확인하세요. 직접 접근·새로고침에서도 제품 조회 전 확인이 필요합니다.');
  } catch(error) {status($('#status'),error.message,true);}
}
