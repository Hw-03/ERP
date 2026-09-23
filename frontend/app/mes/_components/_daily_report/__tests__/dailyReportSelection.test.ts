import { describe, expect, it } from "vitest";
import { resolveSelectedReportAuthorId } from "../dailyReportSelection";

describe("전체 일보 작성자 선택 복원", () => {
  const authors = [{ employee_id: "employee-1" }, { employee_id: "employee-2" }];

  it("목록을 불러오는 중에는 현재 선택 상태를 유지한다", () => {
    expect(resolveSelectedReportAuthorId("employee-1", [], true, false)).toBe("employee-1");
  });

  it("선택한 작성자의 글이 있는 날짜에서 그 작성자를 선택한다", () => {
    expect(resolveSelectedReportAuthorId("employee-2", authors, false, false)).toBe("employee-2");
  });

  it("선택한 작성자의 글이 없는 날짜에서는 선택을 해제한다", () => {
    expect(resolveSelectedReportAuthorId("employee-1", authors.slice(1), false, false)).toBeNull();
  });

  it("오류 난 목록은 빈 날짜로 간주하지 않는다", () => {
    expect(resolveSelectedReportAuthorId("employee-1", [], false, true)).toBe("employee-1");
  });
});
