# PinInput.tsx

## 이 파일은 뭐예요?
숫자 전용 PIN 비밀번호 입력 필드 컴포넌트입니다. `inputMode="numeric"`, `type="password"`, 넓은 자간(tracking-[0.4em])으로 PIN 입력에 최적화되어 있으며 숫자 외 문자는 자동으로 걸러냅니다.

## 언제 보나요?
- 작업자 인증 시 PIN 번호 입력할 때 (OperatorMenuSheet)
- 결재 승인/반려 시 결재자 PIN 입력할 때 (ApprovalQueuePanel)
- 입출고 내역 상세에서 PIN 확인할 때 (HistoryDetailSheet)

## 중요한 내용
- `PinInput({ label?, value, onChange, maxLength?, placeholder?, className? })` — controlled 컴포넌트
- `maxLength` 기본값 8, 숫자 외 문자는 `replace(/\D/g, "")` 로 자동 제거
- `type="password"` + `inputMode="numeric"` + `autoComplete="off"` 조합
- `label`이 있으면 대문자+자간 1px 캡션 라벨을 위에 표시

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/tokens.ts]] — `TYPO` 타이포 토큰 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
