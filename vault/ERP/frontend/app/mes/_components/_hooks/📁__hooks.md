# 📁 _hooks

## 이 폴더는 뭐예요?

`_components/` 전체에서 공유하는 범용 훅 모음입니다. 특정 기능 탭에 귀속되지 않는 공용 로직이 여기 있습니다.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `useToggleSet.ts` | Set 기반 토글 상태 (12곳에서 재사용) |
| `useInventoryData.ts` | 재고 데이터 공용 페칭 |
| `useHistoryData.ts` | 내역 데이터 공용 페칭 |
| `useDesktopInventoryDerivations.tsx` | 재고 파생 값 계산 |
| `useBarcodeScanner.ts` | 바코드 스캐너 이벤트 훅 |
| `useChunkedRender.ts` | 대용량 목록 청크 렌더링 |
| `useResource.ts` | 범용 비동기 자원 로더 |
| `useItemImageManifest.ts` | 품목 이미지 매니페스트 |
| `useFocusTrap.ts` | 모달 포커스 트랩 |
| `CONTRACT.md` | 이 폴더 사용 계약 (훅 추가 기준) |

## 언제 여기를 보나요?

- 여러 섹션에서 중복으로 쓰이는 상태 로직을 리팩터링할 때
- 바코드 스캐너나 청크 렌더링 동작을 수정할 때

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/mes/📁_mes]] — MES 비즈니스 로직 (훅보다 하위 수준)
