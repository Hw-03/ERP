# 📁 common

## 이 폴더는 뭐예요?

`_components/` 전체에서 공유하는 원자(atom) 수준 UI 컴포넌트 모음입니다. 특정 기능 탭에 귀속되지 않는 재사용 부품입니다.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `EmptyState.tsx` | 데이터 없음 화면 |
| `LoadingSkeleton.tsx` | 로딩 중 스켈레톤 |
| `LoadFailureCard.tsx` | 로드 실패 카드 |
| `StatusPill.tsx` | 상태 배지 (색상·레이블) |
| `ResultModal.tsx` | 작업 결과 모달 |
| `SlidePanel.tsx` | 우측 슬라이드 패널 컨테이너 |
| `FilterChip.tsx` | 필터 칩 버튼 |
| `KpiCard.tsx` | KPI 요약 카드 |
| `AppSelect.tsx` | 공용 Select 드롭다운 |
| `index.ts` | 배럴 내보내기 |

## 언제 여기를 보나요?

- 화면 전체에서 쓰이는 공용 UI 부품을 수정할 때
- 새 공용 컴포넌트를 추가할 위치를 찾을 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/ui/📁_ui.md]] — 더 하위 수준의 UI 라이브러리 (`Button`, `Toast`, `BottomSheet` 등)
