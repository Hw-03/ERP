# HandoverComposeForm.tsx

## 이 파일은 뭐예요?
튜브 부서 담당자가 인수인계서를 작성·임시저장·제출하는 폼 컴포넌트. 제목·인수 부서·제품명·공정 내용·품목 목록·분석 내용·비고 필드를 포함하며, 기존 draft를 이어서 작성하는 기능도 지원한다.

## 언제 보나요?
- `HandoverSectionPanel`의 "작성" 서브탭이 활성이고 작성자가 튜브 부서 소속일 때
- `draft` prop이 null이면 신규 작성, 값이 있으면 이어쓰기 모드로 마운트됨

## 중요한 내용
- `HandoverComposeForm({ authorEmployeeId, items, draft, onCreated, onDraftSaved })` — 주요 export
- `RECEIVE_DEPARTMENTS = ["고압", "진공"]` — 인수 부서 선택지 고정
- 품목 선택지는 `mes_code`에 "TF"가 포함된 품목만 (튜브 TF 품목)
- `saveDraft()` — `api.saveHandoverDraft()` 호출, handover_id 자동 갱신
- `submit()` — draft 있으면 갱신 후 `api.submitHandover()`, 없으면 `api.createHandover()` 직접 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/HandoverSectionPanel.tsx]] — 이 폼을 "compose" 서브탭에서 렌더하는 부모 패널
