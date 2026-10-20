// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, registerAdminPinProvider } from "../../api-core";
import { setAuditScreen } from "../../activity-audit-context";
import { ioApi } from "../io";
import { stockRequestsApi } from "../stock-requests";
import { workReservationsApi } from "../work-reservations";

const fetchMock = vi.fn<typeof fetch>();

function respond(body: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  registerAdminPinProvider(() => null);
  setAuditScreen(null);
});

afterEach(() => {
  registerAdminPinProvider(() => null);
  vi.unstubAllGlobals();
});

describe("작업 예약 조회와 취소의 HTTP 계약", () => {
  it("일반 품목 조회는 자기 예약 가산 없이 선택 품목과 취소 signal을 전송한다", async () => {
    const controller = new AbortController();
    respond({ item_id: "item / 1", works: [] });
    await workReservationsApi.getItemWorkStatus("item / 1", { signal: controller.signal });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url), "http://localhost").searchParams.get("item_id")).toBe("item / 1");
    expect(String(url)).not.toContain("owner_batch_id");
    expect(init).toMatchObject({ credentials: "include", signal: controller.signal });
    expect(new Headers(init?.headers).has("X-Admin-Pin")).toBe(false);
  });

  it("관리자 필터의 false와 0을 보존하고 PIN은 헤더로만 전달한다", async () => {
    registerAdminPinProvider(() => "test-pin");
    const controller = new AbortController();
    respond({ items: [], total: 0 });
    await workReservationsApi.listAdmin({
      search: "튜브 & 부품", requester_department: "조립", requester_employee_id: "employee/1",
      reservation_status: "needs_reservation", owner_active: false,
      view: "active", sort: "updated_asc", skip: 0, limit: 25,
    }, { signal: controller.signal });
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url), "http://localhost");
    expect(parsed.pathname).toBe("/api/admin/work-reservations");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      search: "튜브 & 부품", requester_department: "조립", requester_employee_id: "employee/1",
      reservation_status: "needs_reservation", owner_active: "false",
      view: "active", sort: "updated_asc", skip: "0", limit: "25",
    });
    expect(new Headers(init?.headers).get("X-Admin-Pin")).toBe("test-pin");
    expect(init?.signal).toBe(controller.signal);
    expect(String(url)).not.toContain("test-pin");
  });

  it("기본 목록은 미지정 필터를 보내지 않는다", async () => {
    respond({ items: [] });
    await workReservationsApi.listAdmin();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/work-reservations");
  });

  it("상세 조회의 배치 경로를 인코딩한다", async () => {
    respond({ batch_id: "batch/1" });
    await workReservationsApi.getAdminDetail("batch/1");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/work-reservations/batch%2F1");
  });

  it("취소에는 읽은 버전과 사유를 보내고 행위자 이름을 임의로 넣지 않는다", async () => {
    registerAdminPinProvider(() => "test-pin");
    setAuditScreen({ key: "admin.workReservations", label: "작업 예약 관리" });
    respond({ batch_id: "batch/1", revision: 8, status: "cancelled" });
    const result = await workReservationsApi.cancelAdmin("batch/1", {
      expected_revision: 7, reason: "중복 작업 정리",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/work-reservations/batch%2F1/cancel");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(new Headers(init?.headers).get("X-Admin-Pin")).toBe("test-pin");
    expect(new Headers(init?.headers).get("X-MES-Audit-Screen")).toBe("admin.workReservations");
    expect(new Headers(init?.headers).has("X-MES-Audit-Session")).toBe(true);
    expect(JSON.parse(String(init?.body))).toEqual({ expected_revision: 7, reason: "중복 작업 정리" });
    expect(result.revision).toBe(8);
  });

  it("409는 최신 버전과 원래 입력을 보존하며 자동 재취소하지 않는다", async () => {
    const payload = Object.freeze({ expected_revision: 7, reason: "입력 중인 사유" });
    respond({ detail: { code: "WORK_REVISION_CONFLICT", message: "작업이 변경되었습니다.",
      extra: { batch_id: "b1", current_revision: 8 } } }, 409);
    const error = await workReservationsApi.cancelAdmin("b1", payload).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "WORK_REVISION_CONFLICT", extra: { current_revision: 8 } });
    expect(payload.reason).toBe("입력 중인 사유");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("조회 PIN 거부도 ApiError 상태를 보존한다", async () => {
    respond({ detail: { code: "FORBIDDEN", message: "관리자 인증이 필요합니다." } }, 403);
    await expect(workReservationsApi.listAdmin()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("부족량의 문자열 안내와 구조화된 위치별 수치를 함께 보존한다", async () => {
    const shortage = { item_id: "i1", location: { bucket: "warehouse", department: null },
      required_quantity: 6, available_quantity: 4, shortage_quantity: 2 };
    respond({ detail: { code: "STOCK_SHORTAGE", message: "자재가 부족합니다.",
      extra: { shortages: ["부품 2 EA 부족"], reservation_shortages: [shortage] } } }, 422);
    await expect(ioApi.saveDraft({ requester_employee_id: "e1", work_type: "process",
      sub_type: "produce", bundles: [] })).rejects.toMatchObject({
      status: 422, code: "STOCK_SHORTAGE", message: "자재가 부족합니다.\n부품 2 EA 부족",
      extra: { reservation_shortages: [shortage] },
    });
  });
});

describe("기존 작업 명령의 버전 전달", () => {
  it("요청 수정에 관측한 연결 작업 버전을 전달한다", async () => {
    respond({ batch_id: "b1", revision: 8 });
    await stockRequestsApi.revertToDraft("request-1", { actor_employee_id: "e1", pin: "test", expected_revision: 7 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/stock-requests/request-1/revert-to-draft");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ actor_employee_id: "e1", pin: "test", expected_revision: 7 });
  });

  it("삭제 query에 예상 버전을 전달한다", async () => {
    respond({});
    await ioApi.deleteDraft("b1", "e1", 7);
    expect(new URL(String(fetchMock.mock.calls[0][0]), "http://localhost").searchParams.get("expected_revision")).toBe("7");
  });

  it("기존 작업 제출 body에 예상 버전을 전달한다", async () => {
    respond({});
    await ioApi.submitDraft("b1", "e1", 7);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ expected_revision: 7 });
  });
});
