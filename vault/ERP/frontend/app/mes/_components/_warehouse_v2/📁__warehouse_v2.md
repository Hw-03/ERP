# 📁 _warehouse_v2

## 이 폴더는 뭐예요?

**V2 입출고 워크플로우**의 핵심 UI 폴더입니다. 작업 유형 선택 → 대상 선택 → BOM 자동 전개 → 수량 조정 → 확인 → 제출까지 5단계 흐름을 담당합니다.

전체 입출고 UI 중 가장 복잡한 단위이며, 프론트엔드에서 가장 자주 수정이 일어나는 곳입니다.

## 언제 여기를 보나요?

- 입출고 제출·임시저장·미리보기 흐름에 버그가 있을 때
- 작업 유형(입고·출고·이동·반품 등)별 동작을 수정할 때
- BOM 자동 묶음이나 수량 계산이 이상할 때

## 주요 파일

| 파일 | 역할 |
|------|------|
| `IoComposeView.tsx` | 메인 오케스트레이터 (상태 관리·스텝 분기) |
| `IoWorkTypeStep.tsx` | 작업 유형 선택 단계 |
| `IoTargetPicker.tsx` | 대상(품목·부서) 선택 단계 |
| `IoBundleCart.tsx` | BOM 묶음 장바구니·수량 조정 |
| `IoBundleCard.tsx` | BOM 묶음 카드 표시 |
| `IoLineRow.tsx` | 라인 상세 (수량·상태·불량) |
| `IoConfirmStep.tsx` | 최종 확인·제출 단계 |
| `IoSubmitModals.tsx` | 제출 결과 모달 |
| `BomSubExpander.tsx` | BOM 하위 트리 전개 |
| `ExpandableItemName.tsx` | 품목명·모델 표시 |
| `itemPickerShared.tsx` | 품목 선택 공용 유틸 |
| `_atoms.tsx` | 원자 컴포넌트 (라디오·카드) |

**훅 (하위 `hooks/` 또는 루트 훅 파일):**
| 훅 | 역할 |
|----|------|
| `useIoWorkState` | 전체 워크플로우 상태 머신 |
| `useIoPreview` | 미리보기 API 호출·결과 처리 |
| `useIoDraft` | 임시저장 CRUD |
| `useIoSubmit` | 제출·결과 처리 |
| `useIoUrlSync` | URL과 상태 동기화 |
| `useIoPreselect` | URL 파라미터 사전 선택 |
| `useIoDraftRestore` | 임시저장 자동 복원 |

## 위험도

🟡 중간

작업 유형별 라우팅 규칙(`ioWorkType.ts`)은 백엔드 `approval_rules.py`와 **동기화 필수**. 불일치 시 창고 결재가 누락되거나 즉시 반영돼야 할 것이 대기 큐에 쌓일 수 있음.  
`tests/test_approval_rules_drift.py` 가 이를 자동 검사함.

## 관련 파일

### 먼저 볼 파일
- [[ERP/backend/app/services/io_dispatch.py.md]] — 제출 분기 서비스
- [[ERP/backend/app/services/io_preview.py.md]] — 미리보기 서비스
- [[ERP/backend/app/services/approval_rules.py.md]] — 결재 라우팅 규칙
- [[ERP/frontend/lib/api/io.ts.md]] — API 클라이언트

> [!info]- 더 연결된 파일
> - [[ERP/backend/app/services/io_draft.py.md]] — 임시저장 서비스
> - [[ERP/backend/app/routers/io.py.md]] — 입출고 V2 라우터
