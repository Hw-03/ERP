# 구성품 변경 독립 메뉴 v2 구현 계획

**추천 모델: GPT-5.5** - 출하 메뉴 구조, PA→PA 재고 전환, 신규 화면 UX, 기존 임시 구현 정리가 함께 얽혀 있습니다.
**추천 추론 수준: 높음** - 재고 원장과 입출고 내역 표현 회귀 위험이 있어 꼼꼼한 검증이 필요합니다.
**추천 실행 형태: 솔로** - 같은 화면 언어와 도메인 의미를 일관되게 맞춰야 합니다.

## Summary

목표는 `출하` 첫 화면에 4번째 카드 `구성품 변경`을 추가하고, 기존 `출하 준비 체크` 안에 임시로 들어간 구성품 변경 패널을 제거한 뒤, 출하 요청과 무관하게 PA 재고를 다른 PA 구성으로 전환하는 독립 작업 화면을 완성하는 것입니다.

## GOAL 완료 조건

- 출하 첫 화면 카드가 `출하 요청 / 출하 준비 중 / 구성품 변경 / 출하 이력` 4개로 보입니다.
- `구성품 변경` 카드는 숫자 배지 없이 표시됩니다.
- 구성품 변경은 `소스 PA`, `대상 PA`, `수량 Q`, 선택 메모만으로 실행됩니다.
- 기존 `prepWork` 안의 작은 구성품 변경 패널은 제거됩니다.
- 실행 전 확인 모달과 실행 후 완료 전용 페이지가 있습니다.
- 입출고 내역은 `구성품 변경` 대표 row + 펼침 row로 재고 영향을 보여줍니다.
- 관련 backend/frontend 테스트와 로컬 검증이 통과합니다.

## Key Changes

- `DesktopShippingView`의 출하 허브를 3카드에서 4카드로 변경하고, `구성품 변경` 카드는 배지 없는 바로가기 카드로 둡니다.
- 새 view `componentChangeWork`, `componentChangeComplete`를 추가합니다.
- 구성품 변경 화면은 좌측 `소스 PA`, 우측 `대상 PA`, 하단 `변경되는 구성품만 비교` 구조입니다.
- 소스 PA와 대상 PA는 모두 작업자가 직접 검색/선택합니다.
- 수량 Q는 소스 PA 현재 재고 이하로 제한합니다.
- 같은 PA 선택, BOM 차이 없음, 추가 구성품 부족은 실행 전 차단합니다.
- 메모는 선택 입력입니다.
- 독립 API `GET /api/shipping/component-change-preview`, `POST /api/shipping/component-change`를 추가합니다.
- 실행 시 원장은 source PA `-Q`, target PA `+Q`, 추가 구성품 `-N`, 회수 구성품 `+N`으로 남깁니다.
- 기존 출하 요청 전용 component-change endpoint는 가능하면 새 내부 helper를 재사용하게 정리합니다.
- 실행 전 확인 모달과 실행 후 완료 전용 페이지를 둡니다.
- 입출고 내역은 `구성품 변경` 대표 row와 펼침 row로 표시합니다.

## Test Plan

- Backend
  - source PA와 target PA가 같으면 422
  - 직계 BOM delta가 없으면 422
  - source PA 현재 재고가 Q보다 작으면 422
  - 추가 구성품 재고가 부족하면 422
  - preview는 변경되는 구성품만 반환
  - execute 후 source PA, target PA, 추가/회수 구성품 재고가 정확히 변동
  - transaction logs가 하나의 구성품 변경 reference로 묶임

- Frontend
  - 출하 허브에 4번째 카드 `구성품 변경` 표시
  - 구성품 변경 카드에는 숫자 배지가 없음
  - 카드 클릭 시 독립 구성품 변경 화면 진입
  - 소스/대상 PA 직접 선택 가능
  - 같은 PA 선택 차단
  - Q가 source PA 재고를 넘으면 실행 불가
  - 부족 구성품이 비교표에 표시되고 실행 버튼 비활성화
  - 확인 모달 표시 후 확정 가능
  - 실행 후 완료 페이지 표시
  - 기존 prepWork 안의 구성품 변경 패널 미노출

- Verification
  - `pytest backend/tests/routers/test_shipping.py backend/tests/services/test_shipping.py`
  - `cd frontend && npm test -- DesktopShippingView.test.tsx historyPresentation.test.ts`
  - `git diff --check`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1 -Mode full`

## Assumptions

- 이번 v2는 PC 출하 탭과 PC 입출고 내역 중심입니다.
- 모바일 최적화는 제외합니다.
- 출하 요청 연결은 v1에서 제외하고, 선택 메모만 둡니다.
- source PA 자동 추천은 하지 않습니다.
- BOM 비교는 PA 직계 BOM만 사용합니다.
- 전체 BOM 보기 토글은 제외하고 변경되는 구성품만 표시합니다.
- DB/API 변경은 현재 `shipping-component-change-v1` worktree에서만 진행하고, 메인 워킹트리의 다른 세션 변경은 건드리지 않습니다.
- 커밋/푸시는 구현과 검증 완료 후 사용자가 별도로 요청할 때만 수행합니다.
