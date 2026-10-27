// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { IoBatch, IoLine, Item } from "@/lib/api";
import { IoComposeView } from "../IoComposeView";
import { MobileIoComposeWizard } from "../../mobile/warehouse/MobileIoComposeWizard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/mes",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tab=warehouse&section=compose&step=4"),
}));
vi.mock("@/lib/api", () => ({ api: { getItems: vi.fn(() => Promise.resolve([])) } }));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => 0 }));
vi.mock("@/lib/queries/useBomQuery", () => ({
  useBomParentIdsQuery: () => ({ data: [], isSuccess: true, isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/activity-audit-context", () => ({ setAuditScreen: vi.fn() }));
vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/ui/dirty-guard", () => ({ useRegisterDirty: vi.fn() }));
vi.mock("../IoBundleCart", () => ({
  IoBundleCart: ({ bundles, getAvailable, canAdvance, hasShortage }: {
    bundles: { lines: IoLine[] }[];
    getAvailable: (line: IoLine) => number | null;
    canAdvance: boolean;
    hasShortage: boolean;
  }) => <>
    <output data-testid="owner-available">{getAvailable(bundles[0].lines[0])}</output>
    <output data-testid="owner-shortage">{String(hasShortage)}</output>
    <button type="button" disabled={!canAdvance}>예약한 작업 최종 확인</button>
  </>,
}));
vi.mock("../IoTargetPicker", () => ({ IoTargetPicker: () => null }));
vi.mock("../IoConfirmStep", () => ({ IoConfirmStep: () => null }));

const item = { item_id: "material", item_name: "예약 자재", mes_code: "MATERIAL", unit: "EA", quantity: 5, warehouse_qty: 5, pending_quantity: 5, locations: [] } as unknown as Item;
const line = { line_id: "line", item_id: item.item_id, item_name: item.item_name, mes_code: item.mes_code, unit: "EA", quantity: 5,
  included: true, origin: "manual", from_bucket: "warehouse", from_department: null, to_bucket: "production", to_department: "조립",
  direction: "move", shortage: 0 } as IoLine;
const draft = { batch_id: "reserved-batch", requester_employee_id: "employee", revision: 1, status: "draft", reservation_status: "reserved", work_type: "warehouse_io",
  sub_type: "warehouse_to_dept", from_department: null, to_department: "조립", bundles: [{ bundle_id: "bundle", source_kind: "direct_item",
    source_item_id: item.item_id, title: item.item_name, quantity: 5, lines: [line] }],
  effective_plan: { version: 1, fingerprint: "reserved", effects: [{ item_id: item.item_id, kind: "move", from: { bucket: "warehouse", department: null }, quantity: 5 }] },
} as unknown as IoBatch;

beforeEach(() => window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4"));

it.each(["desktop", "mobile"] as const)("%s 실제 작성기는 복원 직후 본인 예약으로 수량 검증과 다음 단계 활성화를 함께 계산한다", (layout) => {
  const View = layout === "desktop" ? IoComposeView : MobileIoComposeWizard;
  render(<View globalSearch="" operator={{ employee_id: "employee", name: "작업자", department: "조립", warehouse_role: "none" }}
    employees={[]} items={[item]} setItems={vi.fn()} onStatusChange={vi.fn()} restoreDraft={draft} restoreNonce={1} restoreStep={4} />);
  expect(screen.getByTestId("owner-available")).toHaveTextContent("5");
  expect(screen.getByTestId("owner-shortage")).toHaveTextContent("false");
  expect(screen.getByRole("button", { name: "예약한 작업 최종 확인" })).toBeEnabled();
});
