---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/page.tsx
status: active
updated: 2026-04-27
source_sha: c29180b02e30
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# page.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/page.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `3719` bytes

## 연결

- Parent hub: [[frontend/app/legacy/legacy|frontend/app/legacy]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { MobileShell, type TabId } from "./_components/mobile/MobileShell";
import { InventoryScreen } from "./_components/mobile/screens/InventoryScreen";
import { HistoryScreen } from "./_components/mobile/screens/HistoryScreen";
import { Toast, type ToastState } from "./_components/Toast";
import { AdminShell } from "./_components/mobile/screens/admin/AdminShell";
import { DesktopLegacyShell } from "./_components/DesktopLegacyShell";
import {
  WarehouseWizardProvider,
  useWarehouseWizard,
} from "./_components/mobile/io/warehouse/context";
import { WarehouseWizardScreen } from "./_components/mobile/io/warehouse/WarehouseWizardScreen";
import { DeptWizardProvider } from "./_components/mobile/io/dept/context";
import { DeptWizardScreen } from "./_components/mobile/io/dept/DeptWizardScreen";

const TAB_TITLES: Record<TabId, { subtitle: string; title: string }> = {
  inventory: { subtitle: "재고 현황", title: "재고" },
  warehouse: { subtitle: "창고 입출고", title: "창고입출고" },
  dept: { subtitle: "부서 입출고", title: "부서입출고" },
  admin: { subtitle: "관리자", title: "관리자" },
};

export default function LegacyPage() {
  return (
    <WarehouseWizardProvider>
      <DeptWizardProvider>
        <LegacyBody />
      </DeptWizardProvider>
    </WarehouseWizardProvider>
  );
}

function LegacyBody() {
  const [activeTab, setActiveTab] = useState<TabId>("inventory");
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const { dispatch: warehouseDispatch } = useWarehouseWizard();

  const showToast = useCallback((next: ToastState) => setToast(next), []);
  const clearToast = useCallback(() => setToast(null), []);

  const title = useMemo(() => {
    if (showHistory) return { subtitle: "입출고 이력", title: "입출고 이력" };
    return TAB_TITLES[activeTab];
  }, [activeTab, showHistory]);

  return (
    <>
      <div className="lg:hidden">
        <MobileShell
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setShowHistory(false);
          }}
          subtitle={title.subtitle}
          title={title.title}
        >
          {showHistory ? (
            <HistoryScreen onClose={() => setShowHistory(false)} />
          ) : (
            <>
              {activeTab === "inventory" && (
                <InventoryScreen
                  showToast={showToast}
                  onOpenHistory={() => setShowHistory(true)}
                  onBulkIO={(items) => {
                    warehouseDispatch({
                      type: "PREFILL_ITEMS",
                      itemIds: items.map((i) => i.item_id),
                      qty: 1,
                    });
                    warehouseDispatch({ type: "GO", step: 0 });
                    setActiveTab("warehouse");
                    showToast({
                      type: "info",
                      message: `${items.length}건이 창고입출고에 추가되었습니다.`,
                    });
                  }}
                />
              )}
              {activeTab === "warehouse" && <WarehouseWizardScreen showToast={showToast} />}
              {activeTab === "dept" && <DeptWizardScreen showToast={showToast} />}
              {activeTab === "admin" && <AdminShell showToast={showToast} />}
            </>
          )}
        </MobileShell>
      </div>

      <DesktopLegacyShell />

      <Toast toast={toast} onClose={clearToast} />
    </>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
