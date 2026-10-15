// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchConfigProvider } from "@/lib/queries/useItemSearch";
import { itemSearchApi } from "@/lib/api/item-search";
import { ApiError } from "@/lib/api-core";
import { queryKeys } from "@/lib/queries/keys";
import { ItemSearchAliases } from "../ItemSearchAliases";
import { SynonymGroupManager } from "../SynonymGroupManager";
vi.mock("@/lib/api/item-search", () => ({ itemSearchApi: { getConfig: vi.fn(), addAlias: vi.fn(), deleteAlias: vi.fn(), addGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn() } }));
function mount(child: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><SearchConfigProvider>{child}</SearchConfigProvider></QueryClientProvider>), client };
}
const config = { version: "v1", synonym_groups: [{ group_id: "g", version: 1, terms: ["모터", "motor"] }], item_aliases: { i: [{ alias_id: "a", alias: "구동부" }] } };
function newConnection() { return within(screen.getByRole("region", { name: "새 검색어 연결" })); }
async function editConnection() {
  const card = await screen.findByRole("region", { name: /^검색어 연결:/ });
  fireEvent.click(within(card).getByRole("button", { name: "수정", exact: true }));
  return within(card);
}
describe("검색 관리", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(itemSearchApi.getConfig).mockResolvedValue(config); });
  it("별칭 저장 실패 후 입력을 유지하고 같은 입력으로 재시도한다", async () => {
    vi.mocked(itemSearchApi.addAlias).mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValueOnce({ alias_id: "b", alias: "전동기" });
    mount(<ItemSearchAliases itemId="i" />);
    await screen.findByText("구동부");
    const input = screen.getByRole("textbox", { name: "검색용 이름 추가" });
    fireEvent.change(input, { target: { value: "전동기" } });
    fireEvent.click(screen.getByRole("button", { name: "검색용 이름 추가" }));
    await screen.findByText("저장 실패");
    expect(input).toHaveValue("전동기");
    fireEvent.click(screen.getByRole("button", { name: "검색용 이름 추가" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(itemSearchApi.addAlias).toHaveBeenLastCalledWith("i", "전동기");
  });
  it("별칭 삭제는 선택한 별칭 ID만 전달한다", async () => {
    vi.mocked(itemSearchApi.deleteAlias).mockResolvedValue();
    mount(<ItemSearchAliases itemId="i" />);
    fireEvent.click(await screen.findByRole("button", { name: "구동부 삭제" }));
    await waitFor(() => expect(itemSearchApi.deleteAlias).toHaveBeenCalledWith("i", "a"));
  });
  it("동의어 충돌 후 최신 버전을 읽고 초안을 보존한다", async () => {
    vi.mocked(itemSearchApi.updateGroup).mockRejectedValueOnce(new ApiError("다른 직원이 수정했습니다.", 409)).mockResolvedValueOnce({ group_id: "g", version: 3, terms: ["모터", "전동기"] });
    vi.mocked(itemSearchApi.getConfig).mockResolvedValueOnce(config).mockResolvedValue({ ...config, version: "v2", synonym_groups: [{ group_id: "g", version: 2, terms: ["모터", "motor", "구동기"] }] });
    mount(<SynonymGroupManager />);
    const editor = await editConnection();
    const input = editor.getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true });
    fireEvent.change(input, { target: { value: "전동기" } });
    fireEvent.click(editor.getByRole("button", { name: "수정 완료" }));
    await screen.findByText(/다른 직원이 수정했습니다/);
    expect(input).toHaveValue("전동기");
    expect(itemSearchApi.updateGroup).toHaveBeenCalledWith("g", ["모터", "전동기"], 1);
    expect(editor.getByText(/현재 저장:.*구동기/)).toBeVisible();
    fireEvent.click(editor.getByRole("button", { name: "수정 완료" }));
    await waitFor(() => expect(itemSearchApi.updateGroup).toHaveBeenLastCalledWith("g", ["모터", "전동기"], 2));
  });
  it("입력칸 하나를 구문 하나로 저장하고 성공 후 빈 두 칸으로 돌아간다", async () => {
    vi.mocked(itemSearchApi.addGroup).mockResolvedValue({ group_id: "new", version: 1, terms: ["전원 공급기", "PSU"] });
    mount(<SynonymGroupManager />);
    await screen.findByText("모터 ↔ motor");
    const form = newConnection();
    fireEvent.change(form.getByRole("textbox", { name: "검색어", exact: true }), { target: { value: " 전원 공급기 " } });
    fireEvent.change(form.getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true }), { target: { value: "PSU" } });
    expect(form.getByText("전원 공급기 ↔ PSU")).toBeVisible();
    fireEvent.click(form.getByRole("button", { name: "연결 저장" }));
    await waitFor(() => expect(itemSearchApi.addGroup).toHaveBeenCalledWith(["전원 공급기", "PSU"]));
    await waitFor(() => expect(form.getByRole("textbox", { name: "검색어", exact: true })).toHaveValue(""));
    expect(form.getAllByRole("textbox")).toHaveLength(2);
  });
  it("동의어 그룹 삭제는 현재 버전을 전달한다", async () => {
    vi.mocked(itemSearchApi.deleteGroup).mockResolvedValue();
    mount(<SynonymGroupManager />);
    const card = await screen.findByRole("region", { name: /^검색어 연결:/ });
    fireEvent.click(within(card).getByRole("button", { name: "연결 해제" }));
    await waitFor(() => expect(itemSearchApi.deleteGroup).toHaveBeenCalledWith("g", 1));
  });
  it("다른 직원이 그룹을 삭제해도 입력 중인 초안을 표시한다", async () => {
    const { client } = mount(<SynonymGroupManager />);
    const editor = await editConnection();
    fireEvent.change(editor.getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true }), { target: { value: "전동기" } });
    act(() => client.setQueryData(queryKeys.itemSearch.config(), { ...config, version: "v3", synonym_groups: [] }));
    const deleted = await screen.findByRole("region", { name: "삭제된 연결의 입력" });
    expect(within(deleted).getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true })).toHaveValue("전동기");
    expect(within(deleted).getByRole("textbox", { name: "검색어", exact: true })).toHaveAttribute("readonly");
  });

  it("불필요한 설명을 숨기고 예시는 입력하거나 자동 저장하지 않는다", async () => {
    mount(<SynonymGroupManager />);
    await screen.findByText("모터 ↔ motor");
    expect(screen.queryByText(/배터리와 battery를 연결하면/)).not.toBeInTheDocument();
    expect(screen.queryByText(/모든 품목 검색에 적용됩니다/)).not.toBeInTheDocument();
    expect(screen.queryByText("검색어 연결하기")).not.toBeInTheDocument();
    expect(screen.queryByText("서로 다른 표현을 두 개 이상 입력해 주세요.")).not.toBeInTheDocument();
    expect(newConnection().getAllByRole("textbox")).toHaveLength(2);
    newConnection().getAllByRole("textbox").forEach(input => expect(input).toHaveValue(""));
    expect(newConnection().getByRole("button", { name: "연결 저장" })).toBeDisabled();
    expect(itemSearchApi.addGroup).not.toHaveBeenCalled();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("추가한 표현을 삭제해도 다른 입력은 유지하고 기본 두 칸은 남긴다", () => {
    mount(<SynonymGroupManager />);
    const form = newConnection();
    fireEvent.click(form.getByRole("button", { name: "다른 표현 추가" }));
    fireEvent.click(form.getByRole("button", { name: "다른 표현 추가" }));
    fireEvent.change(form.getByRole("textbox", { name: "다른 표현 3", exact: true }), { target: { value: "전동기" } });
    fireEvent.click(form.getByRole("button", { name: "다른 표현 2 삭제" }));
    expect(form.getByRole("textbox", { name: "다른 표현 2", exact: true })).toHaveValue("전동기");
    fireEvent.click(form.getByRole("button", { name: "다른 표현 2 삭제" }));
    expect(form.getAllByRole("textbox")).toHaveLength(2);
    expect(form.queryByRole("button", { name: /삭제/ })).not.toBeInTheDocument();
  });

  it("정규화 중복은 안내하고 연결을 저장하지 않는다", () => {
    mount(<SynonymGroupManager />);
    const form = newConnection();
    fireEvent.change(form.getByRole("textbox", { name: "검색어", exact: true }), { target: { value: "B/D" } });
    fireEvent.change(form.getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true }), { target: { value: "bd" } });
    expect(form.getByRole("alert")).toHaveTextContent("같은 표현");
    expect(form.getByRole("button", { name: "연결 저장" })).toBeDisabled();
  });

  it("기존 연결에 사용된 검색어를 중복 등록하지 않는다", async () => {
    mount(<SynonymGroupManager />);
    await screen.findByText("모터 ↔ motor");
    const form = newConnection();
    fireEvent.change(form.getByRole("textbox", { name: "검색어", exact: true }), { target: { value: "MOTOR" } });
    fireEvent.change(form.getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true }), { target: { value: "전동기" } });
    expect(form.getByRole("alert")).toHaveTextContent("다른 연결");
    expect(form.getByRole("button", { name: "연결 저장" })).toBeDisabled();
  });

  it("검색할 수 없는 구분 문자만 입력하면 저장을 막는다", () => {
    mount(<SynonymGroupManager />);
    const form = newConnection();
    fireEvent.change(form.getByRole("textbox", { name: "검색어", exact: true }), { target: { value: " /-. " } });
    fireEvent.change(form.getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true }), { target: { value: "전동기" } });
    expect(form.getByRole("alert")).toHaveTextContent("검색할 수 있는");
    expect(form.getByRole("button", { name: "연결 저장" })).toBeDisabled();
  });

  it("수정을 취소하면 기존 연결을 유지하고 저장 API를 호출하지 않는다", async () => {
    mount(<SynonymGroupManager />);
    const editor = await editConnection();
    fireEvent.change(editor.getByRole("textbox", { name: "검색어", exact: true }), { target: { value: "다른 값" } });
    fireEvent.click(editor.getByRole("button", { name: "취소", exact: true }));
    expect(screen.getByText("모터 ↔ motor")).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(itemSearchApi.updateGroup).not.toHaveBeenCalled();
  });

  it("새 연결 저장 실패 뒤에는 입력을 보존해 재시도한다", async () => {
    vi.mocked(itemSearchApi.addGroup).mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValueOnce({ group_id: "new", version: 1, terms: ["배터리", "battery"] });
    mount(<SynonymGroupManager />);
    await screen.findByText("모터 ↔ motor");
    const form = newConnection();
    fireEvent.change(form.getByRole("textbox", { name: "검색어", exact: true }), { target: { value: "배터리" } });
    fireEvent.change(form.getByRole("textbox", { name: "같은 뜻의 다른 표현", exact: true }), { target: { value: "battery" } });
    fireEvent.click(form.getByRole("button", { name: "연결 저장" }));
    await screen.findByText("저장 실패");
    expect(form.getByRole("textbox", { name: "검색어", exact: true })).toHaveValue("배터리");
    fireEvent.click(form.getByRole("button", { name: "연결 저장" }));
    await waitFor(() => expect(form.getByRole("textbox", { name: "검색어", exact: true })).toHaveValue(""));
    expect(itemSearchApi.addGroup).toHaveBeenCalledTimes(2);
  });
});
