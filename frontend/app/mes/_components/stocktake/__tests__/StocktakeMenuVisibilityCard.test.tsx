import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson, stocktakeApi } from "@/lib/api/stocktake";
import type { StocktakeMenuVisibility } from "@/lib/api/types/stocktake";
import type { Operator } from "../../login/useCurrentOperator";
import { StocktakeMenuVisibilityCard } from "../StocktakeMenuVisibilityCard";

vi.mock("@/lib/api/stocktake", () => ({ requestJson: vi.fn(), stocktakeApi: { read: vi.fn() } }));
vi.mock("../useStocktakeMenuVisibility", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return { useStocktakeMenuVisibility: () => useQuery({ queryKey: ["stocktake", "menu-visibility", "token"],
    queryFn: () => stocktakeApi.read<StocktakeMenuVisibility>("/api/stocktakes/menu-visibility", "token"), retry: false }) };
});

const operator = { employee_id: "manager", level: "staff", department_role: "primary" } as Operator;
const hidden: StocktakeMenuVisibility = { enabled: false, employee_visible: false, participant_departments: ["창고", "튜브", "고압", "진공", "튜닝", "조립", "출하"], participant_count: 12 };

function mount(disabled = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><StocktakeMenuVisibilityCard operator={operator} token="token" disabled={disabled} /></QueryClientProvider>), client };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(stocktakeApi.read).mockResolvedValue(hidden);
});

describe("참여 직원 전수조사 메뉴 일괄 표시", () => {
  it("개인별 변경 이후에도 현재 일괄 값을 다시 적용할 수 있다", async () => {
    vi.mocked(requestJson).mockResolvedValue(hidden);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "현재 일괄 설정 다시 적용" }));
    await waitFor(() => expect(requestJson).toHaveBeenCalledWith("/api/stocktakes/menu-visibility", "token", expect.objectContaining({ body: JSON.stringify({ enabled: false }) })));
  });
  it("미설정 기본 숨김과 적용 부서·활성 인원을 표시한다", async () => {
    mount();
    expect(await screen.findByRole("switch", { name: "참여 직원에게 전수조사 탭 표시" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("창고 · 튜브 · 고압 · 진공 · 튜닝 · 조립 · 출하")).toBeVisible();
    expect(screen.getByText("활성 직원 12명")).toBeVisible();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("일괄 켜기·끄기는 서버의 일괄 변경 명령을 호출한다", async () => {
    vi.mocked(requestJson).mockResolvedValueOnce({ ...hidden, enabled: true }).mockResolvedValueOnce(hidden);
    mount();
    const toggle = await screen.findByRole("switch");
    vi.mocked(stocktakeApi.read).mockResolvedValue({ ...hidden, enabled: true });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(requestJson).toHaveBeenNthCalledWith(1, "/api/stocktakes/menu-visibility", "token", expect.objectContaining({ method: "PUT", body: JSON.stringify({ enabled: true }) }));
    await waitFor(() => expect(toggle).toBeEnabled());
    vi.mocked(stocktakeApi.read).mockResolvedValue(hidden);
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(requestJson).toHaveBeenNthCalledWith(2, "/api/stocktakes/menu-visibility", "token", expect.objectContaining({ body: JSON.stringify({ enabled: false }) }));
  });

  it("저장 응답의 개인 상태를 다른 직원의 토큰 캐시에 복사하지 않는다", async () => {
    vi.mocked(requestJson).mockResolvedValue({ ...hidden, enabled: true, employee_visible: true });
    const { client } = mount();
    client.setQueryData(["stocktake", "menu-visibility", "other-token"], hidden);
    const toggle = await screen.findByRole("switch");
    vi.mocked(stocktakeApi.read).mockResolvedValue({ ...hidden, enabled: true, employee_visible: true });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeEnabled());
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(client.getQueryData(["stocktake", "menu-visibility", "other-token"])).toEqual(hidden);
  });

  it("저장 중 중복 실행을 막는다", async () => {
    let finish!: (value: StocktakeMenuVisibility) => void;
    vi.mocked(requestJson).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount();
    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeDisabled());
    expect(requestJson).toHaveBeenCalledTimes(1);
    vi.mocked(stocktakeApi.read).mockResolvedValue({ ...hidden, enabled: true });
    finish({ ...hidden, enabled: true });
    await waitFor(() => expect(toggle).toBeEnabled());
  });

  it("저장 실패를 표시하고 현재 서버 상태를 다시 확인한다", async () => {
    vi.mocked(requestJson).mockRejectedValue(new Error("설정 저장 실패"));
    mount();
    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);
    expect(await screen.findByRole("alert")).toHaveTextContent("설정 저장 실패");
    await waitFor(() => expect(stocktakeApi.read).toHaveBeenCalledTimes(2));
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("조회 실패를 숨김 상태로 단정하지 않고 재시도를 제공한다", async () => {
    vi.mocked(stocktakeApi.read).mockRejectedValueOnce(new Error("조회 실패"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("조회 실패");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "표시 설정 다시 불러오기" }));
    expect(await screen.findByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("다른 업무가 처리 중이면 설정을 실행하지 않는다", async () => {
    mount(true);
    const toggle = await screen.findByRole("switch");
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(requestJson).not.toHaveBeenCalled();
  });
});
