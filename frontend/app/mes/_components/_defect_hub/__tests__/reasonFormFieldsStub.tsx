import type { ReasonFormFieldsProps } from "../ReasonFormFields";

/** 공통 폼의 선택 결과만 제공해 호출부의 검증·payload 계약을 검사한다. */
export function ReasonFormFieldsStub({ employeeId, category, memo, onCategoryChange, onMemoChange }: ReasonFormFieldsProps) {
  return <div data-testid="reason-master" data-employee-id={employeeId}>
    <select aria-label="사유 카테고리" value={category} onChange={(event) => onCategoryChange(event.target.value, event.target.value ? `reason-${event.target.value}` : null)}>
      <option value="">카테고리 선택</option>
      {["외관 불량", "기능 불량", "치수 불량", "검사 통과", "기타"].map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
    <textarea aria-label="사유 메모" placeholder="예: 스크래치 다수 / 우측 끝단" value={memo} onChange={(event) => onMemoChange(event.target.value)} />
  </div>;
}
