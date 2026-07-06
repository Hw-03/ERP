"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, History, PackageCheck, RotateCcw, Truck, XCircle } from "lucide-react";
import { api, type ShippingRequest, type ShippingRequestStatus } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

type MobileShippingTab = "requests" | "prep" | "history";

const STATUS_LABEL: Record<ShippingRequestStatus, string> = {
  REQUESTED: "요청",
  PREPARING: "준비 중",
  PREPARED: "준비 완료",
  PICKED_UP: "픽업 완료",
};

const STATUS_TONE: Record<ShippingRequestStatus, string> = {
  REQUESTED: LEGACY_COLORS.blue,
  PREPARING: LEGACY_COLORS.green,
  PREPARED: LEGACY_COLORS.yellow,
  PICKED_UP: LEGACY_COLORS.purple,
};

export function MobileShippingScreen() {
  const [tab, setTab] = useState<MobileShippingTab>("prep");
  const [requests, setRequests] = useState<ShippingRequest[]>([]);
  const [history, setHistory] = useState<ShippingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const activeRequests = useMemo(() => requests.filter((req) => req.status !== "PICKED_UP"), [requests]);
  const prepRequests = useMemo(
    () => requests.filter((req) => req.status === "PREPARING" || req.status === "PREPARED"),
    [requests],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextRequests, nextHistory] = await Promise.all([
        api.getShippingRequests(),
        api.getShippingHistory(),
      ]);
      setRequests(nextRequests);
      setHistory(nextHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "출하 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function upsert(next: ShippingRequest) {
    setRequests((prev) => [next, ...prev.filter((row) => row.request_id !== next.request_id)]);
  }

  async function updateChecklist(req: ShippingRequest, itemId: string, checked: boolean) {
    setPendingId(`${req.request_id}-${itemId}`);
    try {
      upsert(await api.updateShippingChecklist(req.request_id, { checks: [{ item_id: itemId, checked }] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "체크리스트 수정에 실패했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  async function clearChecklist(req: ShippingRequest) {
    setPendingId(`${req.request_id}-clear`);
    try {
      upsert(await api.clearShippingChecklist(req.request_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "체크리스트 전체 해제에 실패했습니다.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mw0 scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
      <div className="rounded-[18px] border px-4 py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ background: tint(LEGACY_COLORS.blue, 16), color: LEGACY_COLORS.blue }}>
            <Truck className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-black leading-tight" style={{ color: LEGACY_COLORS.text }}>출하</span>
            <span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              생성·수정·완료 처리는 PC에서 진행합니다.
            </span>
          </span>
        </div>
      </div>

      <div className="mw0 grid grid-cols-3 gap-2">
        <TabButton active={tab === "requests"} icon={ClipboardList} label="요청" onClick={() => setTab("requests")} />
        <TabButton active={tab === "prep"} icon={PackageCheck} label="준비" onClick={() => setTab("prep")} />
        <TabButton active={tab === "history"} icon={History} label="이력" onClick={() => setTab("history")} />
      </div>

      {loading && <InlineState title="로딩 중" body="출하 데이터를 불러오고 있습니다." />}
      {error && <InlineState title="오류" body={error} tone={LEGACY_COLORS.red} />}

      {!loading && !error && tab === "requests" && (
        <div className="mw0 grid gap-2">
          {activeRequests.length === 0 ? (
            <InlineState title="요청 없음" body="PC에서 새 출하 요청을 만들 수 있습니다." />
          ) : (
            activeRequests.map((req) => <MobileRequestCard key={req.request_id} request={req} />)
          )}
        </div>
      )}

      {!loading && !error && tab === "prep" && (
        <div className="mw0 grid gap-2">
          {prepRequests.length === 0 ? (
            <InlineState title="준비 중 없음" body="PC에서 요청을 준비 중으로 넘기면 표시됩니다." />
          ) : (
            prepRequests.map((req) => (
              <MobilePrepCard
                key={req.request_id}
                request={req}
                pendingId={pendingId}
                onCheck={updateChecklist}
                onClear={clearChecklist}
              />
            ))
          )}
        </div>
      )}

      {!loading && !error && tab === "history" && (
        <div className="mw0 grid gap-2">
          {history.length === 0 ? (
            <InlineState title="이력 없음" body="픽업 완료된 출하가 아직 없습니다." />
          ) : (
            history.map((req) => <MobileRequestCard key={req.request_id} request={req} />)
          )}
        </div>
      )}
    </div>
  );
}

function MobilePrepCard({
  request,
  pendingId,
  onCheck,
  onClear,
}: {
  request: ShippingRequest;
  pendingId: string | null;
  onCheck: (req: ShippingRequest, itemId: string, checked: boolean) => void;
  onClear: (req: ShippingRequest) => void;
}) {
  return (
    <div className="mw0 oh rounded-[18px] border p-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <CardHeader request={request} />
      <div className="mt-3 rounded-[14px] border px-3 py-2 text-xs font-black" style={{ background: tint(LEGACY_COLORS.green, 12), borderColor: tint(LEGACY_COLORS.green, 36), color: LEGACY_COLORS.green }}>
        총 {request.request_quantity ?? 1}대 출하
      </div>
      <div className="mt-3 grid gap-2">
        {request.checklist_lines.length === 0 ? (
          <InlineState title="체크 항목 없음" body="PC에서 BOM을 확인하세요." compact />
        ) : (
          request.checklist_lines.map((line) => (
            <label
              key={line.line_id}
              className="mw0 oh flex min-h-[52px] items-center gap-3 rounded-[14px] border px-3 py-2"
              style={{ background: LEGACY_COLORS.s2, borderColor: line.checked ? LEGACY_COLORS.green : LEGACY_COLORS.border }}
            >
              <input
                type="checkbox"
                aria-label={`${line.item_name} 체크`}
                checked={line.checked}
                disabled={pendingId !== null}
                onChange={(event) => onCheck(request, line.item_id, event.target.checked)}
                className="h-5 w-5"
              />
              <span className="min-w-0 flex-1">
                <span className="ba block text-sm font-black leading-snug" style={{ color: LEGACY_COLORS.text }}>{line.item_name}</span>
                <span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{line.mes_code ?? "-"} · {line.quantity}개</span>
              </span>
              {line.checked ? <CheckCircle2 className="h-5 w-5" style={{ color: LEGACY_COLORS.green }} /> : <XCircle className="h-5 w-5" style={{ color: LEGACY_COLORS.muted2 }} />}
            </label>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => onClear(request)}
        disabled={pendingId !== null || request.checklist_lines.length === 0}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[12px] border px-3 py-2 text-sm font-black disabled:opacity-45"
        style={{ background: tint(LEGACY_COLORS.yellow, 12), borderColor: tint(LEGACY_COLORS.yellow, 45), color: LEGACY_COLORS.yellow }}
      >
        <RotateCcw className="h-4 w-4" />
        전체 해제
      </button>
    </div>
  );
}

function MobileRequestCard({ request }: { request: ShippingRequest }) {
  return (
    <div className="mw0 oh rounded-[18px] border p-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <CardHeader request={request} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <InfoPill label="최종 PA" value={request.final_pa_item_name ?? "-"} />
        <InfoPill label="최종 PF" value={request.final_pf_item_name ?? "-"} />
      </div>
    </div>
  );
}

function CardHeader({ request }: { request: ShippingRequest }) {
  return (
    <div className="mw0 flex items-start justify-between gap-3">
      <div className="mw0 flex-1">
        <div className="truncate text-base font-black" style={{ color: LEGACY_COLORS.text }}>{request.base_pf_item_name}</div>
        <div className="truncate text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{request.base_pf_mes_code ?? "-"} · {request.requested_by_name ?? "요청자 없음"}</div>
      </div>
      <span className="shrink-0 rounded-full px-2 py-1 text-[11px] font-black" style={{ background: tint(STATUS_TONE[request.status], 20), color: STATUS_TONE[request.status] }}>
        {STATUS_LABEL[request.status]}
      </span>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="mw0 rounded-[12px] border px-3 py-2" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
      <div className="text-[11px] font-black" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
      <div className="truncate text-xs font-black" style={{ color: LEGACY_COLORS.text }}>{value}</div>
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Truck; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[16px] border text-xs font-black"
      style={{
        background: active ? tint(LEGACY_COLORS.blue, 18) : LEGACY_COLORS.s1,
        borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
        color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
      }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function InlineState({ title, body, tone = LEGACY_COLORS.muted2, compact = false }: { title: string; body: string; tone?: string; compact?: boolean }) {
  return (
    <div className={`rounded-[16px] border text-center ${compact ? "px-3 py-4" : "px-4 py-8"}`} style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
      <div className="text-sm font-black" style={{ color: tone }}>{title}</div>
      <div className="mt-1 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{body}</div>
    </div>
  );
}
