"use client";

import { useState } from "react";
import type { BOMEntry } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { useAdminBomContext } from "./AdminBomContext";
import { BomComposeTab } from "./_bom_parts/BomComposeTab";
import { BomAllListTab } from "./_bom_parts/BomAllListTab";
import { BomWhereUsedTab } from "./_bom_parts/BomWhereUsedTab";

type BomTab = "compose" | "all" | "whereused";

const TABS: { id: BomTab; label: string }[] = [
  { id: "compose", label: "BOM 작성" },
  { id: "all", label: "전체 BOM" },
  { id: "whereused", label: "사용처 조회" },
];

export function AdminBomSection() {
  const {
    setParentId,
    bomStats,
    setEditingBomId,
    editingQty,
    saveBomQty: doSaveBomQty,
    deleteBomRow: doDeleteBomRow,
    addBomRow: doAddBomRow,
    addRequest,
    setAddRequest,
    deleteRequest,
    setDeleteRequest,
  } = useAdminBomContext();

  const [bomTab, setBomTab] = useState<BomTab>("compose");
  const [editConfirm, setEditConfirm] = useState<BOMEntry | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  async function handleAddConfirm() {
    if (!addRequest) return;
    setAddBusy(true);
    try {
      await doAddBomRow(addRequest.childId, addRequest.qty);
    } finally {
      setAddBusy(false);
      setAddRequest(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteRequest) return;
    setDeleteBusy(true);
    try {
      await doDeleteBomRow(deleteRequest.bomId);
    } finally {
      setDeleteBusy(false);
      setDeleteRequest(null);
    }
  }

  async function handleEditConfirm() {
    if (!editConfirm) return;
    setEditBusy(true);
    try {
      await doSaveBomQty(editConfirm);
    } finally {
      setEditBusy(false);
      setEditConfirm(null);
    }
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* 통계 카드 3개 */}
      <div className="shrink-0 grid grid-cols-3 gap-3">
        {[
          { label: "BOM 관계", value: bomStats.totalRelations, color: LEGACY_COLORS.yellow },
          { label: "상위 품목", value: bomStats.parentCount, color: LEGACY_COLORS.blue },
          { label: "하위 품목 종류", value: bomStats.childCount, color: LEGACY_COLORS.green },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-[20px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
              {label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
              {formatQty(value)}
            </div>
          </div>
        ))}
      </div>

      {/* 탭 바 */}
      <div
        className="shrink-0 flex gap-1 rounded-[16px] border p-1"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setBomTab(id)}
            className="flex-1 rounded-[12px] px-4 py-2 text-sm font-bold transition-colors"
            style={{
              background: bomTab === id ? LEGACY_COLORS.s1 : "transparent",
              color: bomTab === id ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
              boxShadow: bomTab === id ? "0 1px 4px rgba(0,0,0,.08)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {bomTab === "compose" && <BomComposeTab onEditQty={setEditConfirm} />}
      {bomTab === "all" && (
        <BomAllListTab
          onSwitchToCompose={(parentId) => {
            setParentId(parentId);
            setBomTab("compose");
          }}
        />
      )}
      {bomTab === "whereused" && <BomWhereUsedTab />}

      {/* ConfirmModal: BOM 추가 */}
      <ConfirmModal
        open={addRequest !== null}
        title="BOM 항목 추가"
        confirmLabel="BOM에 추가"
        busy={addBusy}
        onClose={() => { if (!addBusy) setAddRequest(null); }}
        onConfirm={handleAddConfirm}
      >
        <div className="text-sm" style={{ color: LEGACY_COLORS.text }}>
          <p>BOM 항목을 추가하시겠습니까?</p>
          {addRequest && (
            <div
              className="mt-3 rounded-[10px] border px-3 py-2.5 text-xs"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
            >
              <div style={{ color: LEGACY_COLORS.muted2 }}>하위 품목</div>
              <div className="font-semibold mt-0.5" style={{ color: LEGACY_COLORS.text }}>{addRequest.childName}</div>
              <div className="mt-1.5" style={{ color: LEGACY_COLORS.muted2 }}>
                소요량 <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>{addRequest.qty} EA</span>
              </div>
            </div>
          )}
        </div>
      </ConfirmModal>

      {/* ConfirmModal: BOM 삭제 */}
      <ConfirmModal
        open={deleteRequest !== null}
        title="BOM 항목 삭제"
        tone="danger"
        confirmLabel="삭제"
        busy={deleteBusy}
        onClose={() => { if (!deleteBusy) setDeleteRequest(null); }}
        onConfirm={handleDeleteConfirm}
      >
        <div className="text-sm" style={{ color: LEGACY_COLORS.text }}>
          <p>이 BOM 항목을 삭제하시겠습니까?</p>
          {deleteRequest && (
            <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {deleteRequest.childName}
            </div>
          )}
        </div>
      </ConfirmModal>

      {/* ConfirmModal: 소요량 변경 */}
      <ConfirmModal
        open={editConfirm !== null}
        title="소요량 변경"
        confirmLabel="변경 저장"
        busy={editBusy}
        onClose={() => { if (!editBusy) { setEditConfirm(null); setEditingBomId(null); } }}
        onConfirm={handleEditConfirm}
      >
        <div className="text-sm" style={{ color: LEGACY_COLORS.text }}>
          <p>소요량을 변경하시겠습니까?</p>
          {editConfirm && (
            <div className="mt-2 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              새 소요량:{" "}
              <span className="font-semibold" style={{ color: LEGACY_COLORS.text }}>
                {editingQty} {editConfirm.unit}
              </span>
            </div>
          )}
        </div>
      </ConfirmModal>
    </div>
  );
}
