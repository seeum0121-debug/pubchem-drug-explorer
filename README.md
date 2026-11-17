# PubChem 약물 탐색기

빌드 없는 정적 HTML/CSS/JavaScript ES modules 앱입니다. PubChem 화합물과 미국 openFDA 제품·라벨을 구분하여 표시합니다. 의료 조언·복약 지시·국내 의약품 데이터 서비스가 아닙니다.

## 실행

Node.js 24 이상에서 `npm ci`, `npm run serve` 실행 후 http://127.0.0.1:4173 에 접속합니다. 배포에는 Node.js나 패키지 설치가 필요하지 않습니다. `file://` 대신 로컬 HTTP 또는 HTTPS를 사용하세요.

## 사용

1. 한글 또는 영문 성분명을 입력합니다. PC Chrome의 기본 Translator API가 한글을 영문 후보로 번역합니다. 최초 모델 다운로드가 필요하며, 후보를 수정한 후 명시적으로 검색해야 합니다.
2. PubChem CID·성분명·구조를 확인하고 상세 페이지로 이동합니다.
3. 상세 페이지에서 다시 성분을 확인하면 출처 있는 UNII로 미국 라벨을 20개씩 조회합니다. 추가 조회는 사용자 버튼으로만 실행됩니다.
4. 정확한 NDC/SPL 버전/성분 근거가 연결된 제품을 선택합니다. 전체 성분·함량·제형·경로는 NDC 레코드에서, 약리·이상반응·경고는 해당 라벨에서 가져옵니다.
5. 영문 원문 옆 번역 버튼으로 한국어 기계번역을 요청합니다. 기전 분류는 기전 설명과 다르며, 경고는 이상반응을 대신하지 않습니다.

## 안전한 데이터 해석

- 이름·배열 순서·사용자 확인만으로 제품을 연결하지 않습니다. UNII, product_ndc, spl_id=label.id, spl_set_id=label.set_id를 검증합니다.
- 복합제의 성분–UNII 직접 대응이 없거나 염·버전·중복 키가 충돌하면 보류합니다. 이는 해당 자료의 연결 한계이며 약물 자체의 부재를 뜻하지 않습니다.
- 제형·경로·ADR 누락은 자료 없음으로 표시합니다. 다른 제품 라벨이나 경고를 끌어와 채우지 않습니다.
- 각 필드의 원본 경로·제공자·조회 시각을 출처 상세에서 확인할 수 있습니다. 라벨 effective_time은 조회 시각과 다른 원자료 날짜입니다.
- 번역 미지원·다운로드 실패 시 영어 검색과 영문 원문은 계속 사용할 수 있습니다. 번역을 정확한 의학 해석으로 간주하지 마세요.
- 모든 API 요청은 직렬, 기본 1초 간격, 20초 제한입니다. 429/일시적 5xx만 최대 두 번 재시도하며 장기 Retry-After는 중단 안내합니다. 세션 캐시와 취소·세대 검사를 적용합니다.
- API 키·백엔드·회원가입·유료 서비스·고정 한글 약물 사전이 없습니다.

## 검증

- `npm test`: fixture 기반 식별/요청 테스트.
- `node tests/browser.js`: Chrome 브라우저 모의 API/모의 번역 adversarial 테스트.
- `node tests/image-browser.js`: JSON/PNG 공통 큐, 이미지 취소·시간 초과·URL 정리, 다음 페이지 실패 후 재시도 테스트.
- `node tools/pages-probe.js`: 공개 Pages에서 세 성분의 실제 구조·번역·제품 선택 검증.
- `/tests/index.html`: 브라우저 fixture 테스트 화면.
- `node tools/probe.js`: 실제 Chrome CORS/API/Translator 가용성 확인.
- `node tools/live-app.js`: 실제 API 기반 검색·제품 연결 확인.
- `node tools/translation-probe.js`: 실제 Chrome ko→en 후보·검색과 en→ko 라벨 번역.

Chrome은 설치되어 있어야 합니다. 자동화는 격리 프로필만 사용하며 기존 사용자 프로필을 변경하지 않습니다. 번역 모델 자동화는 Playwright 기본 component-update/background-networking 비활성화 인자를 제외해야 합니다. 테스트 서버는 127.0.0.1에만 바인딩합니다.

## GitHub Pages

저장소 main 브랜치의 루트를 Pages 소스로 지정합니다. `index.html`, `detail.html`, `assets/`, `js/`가 정적 배포물이며 상대 경로로 저장소 하위 URL에서도 동작합니다. 비밀값이나 사용자 프로필을 업로드하지 마세요.

실행 증거와 한계: [docs/verification.md](docs/verification.md).
