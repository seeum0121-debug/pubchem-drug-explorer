import {getCompound,getUnii} from './pubchem.js';
import {findProducts} from './openfda.js';
import {linkProducts} from './identity.js';
import {translate} from './translator.js';
import {$,el,field,link,compoundCard,status,validCid,Generation} from './render.js';
const requests = new Generation(), selection = new Generation();
const compoundLifetime = new AbortController();
window.addEventListener('pagehide', () => compoundLifetime.abort(), {once:true});
let compound, evidence, skip = 0;
const products = new Map();
let labels = [], ndcs = [], lookupHeld = [];
const sections = [
  ['작용 기전 설명','mechanism_of_action'],
  ['작용 기전 분류 (설명 아님)','openfda.pharm_class_moa'],
  ['임상 약리 설명','clinical_pharmacology'],
  ['약리 효과 분류 (설명 아님)','openfda.pharm_class_pe'],
  ['이상반응 (ADR)','adverse_reactions'],
  ['경고 (ADR과 별개)','warnings']
];
function source(parent,title,url) {if(url) parent.append(link(title,url));}
function select(product) {
  const request = selection.next();
  const root = $('#label'); root.replaceChildren();
  const {ndc,label,selectionKey} = product;
  root.dataset.selectionKey = selectionKey;
  root.append(el('h2',ndc.brand_name || ndc.generic_name || '제품명 자료 없음'),el('p','미국 openFDA · 선택한 NDC 제품에 연결된 정확한 SPL 라벨'));
  const details = el('dl');
  for(const [title,value] of [['NDC',ndc.product_ndc],['제품명',ndc.brand_name],['일반명',ndc.generic_name],['전체 성분 / 함량',ndc.active_ingredients?.map(x=>`${x.name ?? '자료 없음'} / ${x.strength ?? '자료 없음'}`)],['제형',ndc.dosage_form],['경로',ndc.route],['SPL set_id',label.set_id],['라벨 버전 id',label.id],['원자료 날짜 (effective_time)',label.effective_time],['제품 조회 시각',ndc._retrievedAt],['라벨 조회 시각',label._retrievedAt]]) field(details,title,value);
  root.append(details);
  if(product.sharedLabel) root.append(el('p','공유 라벨: 여러 NDC 제품에 연결됩니다. 아래 문장은 이 제형만의 설명으로 재해석하지 않습니다.','notice'));
  source(root,'NDC 제품 원자료',ndc._sourceUrl); source(root,'SPL 라벨 원자료',label._sourceUrl);
  const provenance = el('details'); provenance.append(el('summary','필드별 출처·식별 근거'),el('pre',JSON.stringify(product.provenance,null,2)));root.append(provenance);
  for(const [title,path] of sections) {
    const value = path.split('.').reduce((v,key)=>v?.[key],label);
    const text = Array.isArray(value) ? value.join('\n\n') : value;
    const section = el('article',undefined,'card');section.append(el('h3',title),el('small',`원본 필드: ${path} · label ${label.id}`));
    if(!text) {section.append(el('p','자료 없음 — 다른 항목이나 다른 제품의 설명으로 대체하지 않습니다.'));root.append(section);continue;}
    section.append(el('h4','영문 원문'),el('p',text,'source-text'));
    const button = el('button','한국어 기계번역');const state = el('p');const translated = el('p',undefined,'translation-text');
    button.addEventListener('click',async()=> {
      button.disabled=true;
      try {
        const result=await translate(text,'en','ko',message=>{if(request.current())state.textContent=message;});
        if(request.current() && root.dataset.selectionKey===selectionKey) {translated.textContent=result;state.textContent='한국어 기계번역 · 정확성 보장 없음';}
      } catch(error) {if(request.current())status(state,error.message,true);}
      finally {if(request.current())button.disabled=false;}
    });section.append(button,state,translated);root.append(section);
  }
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
    if(activeKey && !cumulative.products.some(p=>p.selectionKey===activeKey)){selection.next();$('#label').replaceChildren();}
    products.clear(); $('#products').replaceChildren(); $('#held').replaceChildren();
    for(const product of cumulative.products) {
      if(products.has(product.selectionKey))continue;
      products.set(product.selectionKey,product);
      const n=product.ndc;
      const button=el('button',`${n.brand_name || n.generic_name || '제품명 자료 없음'} · NDC ${n.product_ndc} · ${n.dosage_form || '제형 자료 없음'} · ${n.route?.join(', ') || '경로 자료 없음'} · ${n.active_ingredients?.map(x=>`${x.name} ${x.strength || '함량 자료 없음'}`).join(' + ')} · label ${product.label.id}`,'product');
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
$('#confirm-compound').addEventListener('click',()=>{skip=0;labels=[];ndcs=[];lookupHeld=[];products.clear();$('#products').replaceChildren();$('#held').replaceChildren();selection.next();$('#label').replaceChildren();loadProducts();});
$('#more').addEventListener('click',loadProducts);
const cid=new URLSearchParams(location.search).get('cid');
if(!validCid(cid)) status($('#status'),'유효하지 않은 CID입니다. 검색 화면에서 성분을 선택하세요.',true);
else {
  try {
    compound=await getCompound(cid,{signal:compoundLifetime.signal});
    const card=compoundCard(compound,{signal:compoundLifetime.signal}), fields=el('dl');
    for(const [title,value] of [['IUPAC명',compound.IUPACName],['SMILES',compound.ConnectivitySMILES],['XLogP',compound.XLogP],['조회 시각',compound.retrievedAt]])field(fields,title,value);
    card.append(fields);$('#compound').append(card);$('#confirm-compound').hidden=false;
    status($('#status'),'CID와 구조를 확인하세요. 직접 접근·새로고침에서도 제품 조회 전 확인이 필요합니다.');
  } catch(error) {status($('#status'),error.message,true);}
}
