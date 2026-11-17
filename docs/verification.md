# 실행 검증

## 최신 후속 수정 (2026-11-18 UTC+09:00)

이 절이 아래 과거 실행 기록보다 최신입니다. 이번 변경은 본문 폭/행간·선택 카드·초점 이동·경고 우선 배치, 실패 원문 자동 펼침, 빈 번역 거부입니다. CID–UNII 식별 검증과 하단 출처 접기는 유지했습니다.

- `npm test`: 30/30. `tests/browser.js`: 8, `tests/auto-browser.js`: 6, `tests/image-browser.js`: 5 시나리오 통과.
- auto-browser는 모의 모델로 pending 공유, 클릭 activation, 진행 중 제품 전환, 다운로드 실패/재시도, 본문 번역 실패를 검증했습니다.
- `tools/translation-probe.js`: 전체 실패. 최초 실행과 재실행 모두 ko→en 모델 생성 거부를 관찰했습니다. 재실행은 검색 실패와 별도로 실제 aspirin 제품에서 en→ko 자동 번역 완료를 확인했습니다. 오류를 성공 처리하지 않습니다.
- 실제 모델/실제 API의 최신 화면: [1280px](evidence/readability-desktop.png), [390px](evidence/readability-mobile.png). 좁은 화면의 가로 넘침 검사 통과. 번역문에 의학적 의미 왜곡이 있어 정확성 보장은 불가합니다.
- 공식 URL 3개 재조회: e약은요 공개 4,730건/엑셀다운로드 표시, 공공데이터포털 무료이나 ServiceKey 필수, 자료실 응답에는 목록만 노출. XLSX 임상 본문·키 없는 자동 연동은 검증하지 못했습니다. 웹 열람권과 API 데이터 이용허락을 구분합니다.

## 승인·환경

- 승인 계획 SHA256: `96b92989d6018fbf96558adda8e1fae9888541abd3f75f3a047e72ea8fae01d1` (실제 파일 해시 일치 확인).
- 로컬 경로: `C:/Users/DS/harness/pubchem-drug-explorer`.
- Windows 11, Node.js 24.21.0, 실제 설치 Chrome 157.0.8103.79. 기존 사용자 프로필을 사용하거나 변경하지 않고 Playwright 격리 프로필로 실행.
- 증거 JSON의 시각은 UTC 원자료입니다. 아래 사람이 읽는 시각은 UTC+09:00으로 표시합니다.

## 실제 브라우저 / 실제 API

2026-11-17 22:48~22:58 UTC+09:00에 로컬 HTTP origin에서 실행했습니다. [api-browser.json](evidence/api-browser.json), [live-app.json](evidence/live-app.json), [translation-browser.json](evidence/translation-browser.json)에는 정확한 관측 UTC 시각과 URL·응답이 있습니다. 단순 원시 HTTP 성공과 브라우저 fetch 성공을 구분하며 이번 증거는 Chrome 안의 fetch입니다.

- PubChem aspirin CID2244, C9H8O4, 180.16; acetaminophen CID1983, C8H9NO2, 151.16; ibuprofen CID3672, C13H18O2, 206.28. 실제 API HTTP200.
- PubChem UNII annotation·openFDA label·NDC 모두 브라우저 HTTP200.
- 아스피린 실제 앱 첫 라벨 페이지: 13개 연결 제품, 7건 연결 보류. 전부 보류하거나 누락 처리한 구현이 아님.
- 실제 양성: CID2244, FDA GSRS UNII `R16CO5Y76E`, NDC `59726-065`, 성분 ASPIRIN 81 mg/1, 제형 TABLET, COATED, 경로 ORAL.
- NDC spl_id = label.id `008ee85b-5cac-45a6-a857-a828f8125175`; set_id `0058175f-3474-40c3-a046-6cfaec86d84b`.
- 실제 선택키: `["59726-065","0058175f-3474-40c3-a046-6cfaec86d84b","008ee85b-5cac-45a6-a857-a828f8125175"]`.
- 원자료 endpoint: `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/2244/JSON?heading=UNII`; `https://api.fda.gov/drug/ndc.json?search=product_ndc:%2259726-065%22&limit=1`; `https://api.fda.gov/drug/label.json?search=openfda.product_ndc:%2259726-065%22&limit=1`.
- 필드별 출처·조회 시각과 라벨 원자료 effective_time은 live-app.json에 별도로 보존되어 있습니다.

## 실제 기본 Translator

초기 Playwright 기본 옵션에서 모델 다운로드가 180초 안에 완료되지 않았습니다. 가짜 번역으로 우회하지 않았습니다. Playwright의 component-update/background-networking 비활성화 옵션을 제거한 격리 Chrome에서는 실제 모델 번역에 성공했습니다.

- 아스피린 → Aspirin → PubChem CID2244.
- 아세트아미노펜 → acetaminophen → CID1983.
- 이부프로펜 → Ibuprofen → CID3672.
- 선택한 실제 라벨의 `Cyclooxygenase Inhibitors [MoA]` → `시클로옥시게나제 억제제 [MOA]`.
- 이 항목은 기전 **분류**이며 기전 설명이나 ADR로 표시하지 않습니다. 없는 ADR은 자료 없음입니다.
- [실제 앱 화면](evidence/live-app.png), [실제 번역 화면](evidence/translation-browser.png).

## Fixture와 모의 통합 검증 (실제 제공자 성공과 별개)

`npm test`: 27/27 통과. 정확한 연결·순서 섞인 배열·두 실제 NDC만 생성·SPL/set 불일치·식별 누락·염·복합제 보류·동일 키 충돌·제형/경로 누락·완전 동일 중복·세대 취소·잘못된 CID·요청 중복/캐시·소비자별 취소·재시도/간격·Retry-After·404 오류코드·잘못된 JSON·네트워크·시간 초과를 검증했습니다.

`node tests/browser.js`: 8개 브라우저 시나리오 통과. fixture 실행, 잘못된 CID, 번역 미지원 후 영문 유지, 한글 후보 수정/확인, 빠른 재검색, 상세 새로고침 확인, 악성 HTML textContent 처리, 공유 라벨의 A→B 전환 후 늦은 번역 차단. [자동화 기록](evidence/browser-adversarial.json), [화면](evidence/browser-adversarial.png). 이 suite의 번역은 의도적으로 모의이며 실제 번역 증거는 위에 따로 있습니다.

## 게시 및 남은 검증

기존 Git credential helper 인증으로 공개 저장소와 Pages를 생성했습니다. 비밀값은 출력·저장하지 않았습니다.

- 저장소: https://github.com/seeum0121-debug/pubchem-drug-explorer
- 사이트: https://seeum0121-debug.github.io/pubchem-drug-explorer/
- `node tools/pages-probe.js`: 공개 HTTPS 사이트에서 실제 Chrome 한글 3종 후보 번역→확인→PubChem 결과→각 화학 상세, 뒤로 가기, 직접 상세 접근/새로고침, 세 성분 각각의 제품/제형/경로/정확 라벨, en→ko 번역을 재실행했습니다. 9개 관측 단계 성공, pageerror 없음. [공개 사이트 자동화 기록](evidence/pages.json), [공개 사이트 화면](evidence/pages.png).
- 새 계정·새 인증정보·유료 서비스 없이 기존 계정을 사용했습니다. Git 작성자 설정은 커밋 명령에만 적용했으며 전역 Git 설정을 변경하지 않았습니다.
- 외부 제공자 데이터 및 Chrome 모델 가용성은 이후 바뀔 수 있습니다. 모든 의약품의 연결·번역 성공이나 의학적 정확성을 보장하지 않습니다.

## 경계 리뷰 수정 및 추가 증거

- R1: 직접 img.src 요청이 공통 큐를 우회하는 문제를 발견하여 JSON/PNG 모두 하나의 직렬 전송 계층을 사용하도록 수정했습니다. 캐시·중복 제거·취소·시간 제한·재시도 정책을 공유하고 object URL은 로드/오류/취소 때 해제합니다.
- C1: 어댑터에서 제공하지 않는 CanonicalSMILES 대체 경로를 제거했습니다.
- R2: 추가 페이지 조회 실패 후 동일 offset을 재시도할 수 있으며 이전 제품/선택이 유지됩니다.
- `node tests/image-browser.js`: 5개 추가 시나리오 통과. 실제 dispatch 이후 이미지 취소, 혼합 JSON/PNG 간격, 시간 초과, 디코딩 실패/URL 해제, 상세 확인 중 이미지 유지 및 페이지 offset 0→1(실패)→1(성공)을 검증했습니다. [기록](evidence/image-browser.json), [화면](evidence/image-browser.png).
- 공개 세 성분 제품 선택 근거: aspirin NDC59726-065; acetaminophen NDC63941-519 / set_id0005aafa-08f8-4990-a54d-cc097195708f / label.id ee8e3aa2-8550-41c7-9911-0723b3fb2f87; ibuprofen NDC59779-438 / set_id00653b7c-7099-487e-9a01-e89781c21323 / label.id4bd1345d-d116-426e-825f-bbf29381746a. 정확한 제형·경로·성분/함량·원문·한국어 번역은 pages.json에 보존합니다.

## 사용자 후속 변경 검증 (2026-11-17)

한국어 중심 가독성, 제품 클릭 즉시 자동 번역, 하단 접힌 출처/원문, 실제 URL·기능·스크린샷 README를 반영했습니다. 식별 검증은 유지했습니다. `npm test` 29/29, 기존 browser 8, image-browser 5, auto-browser 3 시나리오 통과. auto-browser는 user activation 안의 create·동일 모델 promise 재사용·제품 전환·자동 다운로드 실패·원문 열람·재시도를 검증합니다.

실제 Chrome 공개 Pages에서 세 성분 검색·구조·제품 선택·버튼 없는 자동 한국어 번역 완료를 재검증했습니다. pages.json의 9단계 모두 성공, pageerror 없음. 첫 번역 모델 생성이 일시적으로 거부된 별도 로컬 실행도 있었으며 재실행에서는 실제 번역 성공; 모델 가용성을 보장하지 않습니다. 최초 다운로드/실패 상태를 숨기지 않습니다. 스크린샷 pages-2244.png, pages-1983.png, pages-3672.png는 변경된 공개 레이아웃입니다.

국내 공식 자료는 e약은요 공개 검색과 data.go.kr 15075057 공식 문서를 추가 2회 조회했습니다. 공개 검색 4730건/일반의약품 개요 범위 확인, API 무료이나 ServiceKey 필수 확인. 무키 자동 통합·재사용 권한·성분 대응까지 검증된 한국어 상세 자료는 확보하지 못했습니다. 앱은 공식 외부 검색 링크만 제공하며 미국 원자료 번역을 한국 원자료라고 표시하지 않습니다. 상세 조건은 README 표에 기록했습니다.
