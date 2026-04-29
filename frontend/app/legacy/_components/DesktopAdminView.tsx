"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  FileDown,
  KeyRound,
  Layers,
  PackagePlus,
  PanelRight,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  api,
  type BOMDetailEntry,
  type BOMEntry,
  type DepartmentMaster,
  type Employee,
  type Item,
  type ProductModel,
  type ShipPackage,
} from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { PinLock } from "./PinLock";
import { LEGACY_COLORS, formatNumber } from "./legacyUi";
import { AdminMasterItemsSection } from "./_admin_sections/AdminMasterItemsSection";
import { AdminEmployeesSection } from "./_admin_sections/AdminEmployeesSection";
import { AdminBomSection } from "./_admin_sections/AdminBomSection";
import { AdminBomProvider } from "./_admin_sections/AdminBomContext";
import { AdminPackagesProvider } from "./_admin_sections/AdminPackagesContext";
import { AdminMasterItemsProvider } from "./_admin_sections/AdminMasterItemsContext";
import { AdminEmployeesProvider } from "./_admin_sections/AdminEmployeesContext";
import { AdminModelsProvider } from "./_admin_sections/AdminModelsContext";
import { AdminPackagesSection } from "./_admin_sections/AdminPackagesSection";
import { AdminModelsSection } from "./_admin_sections/AdminModelsSection";
import { AdminExportSection } from "./_admin_sections/AdminExportSection";
import { AdminDangerZone } from "./_admin_sections/AdminDangerZone";
import { AdminDepartmentsProvider } from "./_admin_sections/AdminDepartmentsContext";
import { AdminDepartmentsSection } from "./_admin_sections/AdminDepartmentsSection";
import { EMPTY_ADD_FORM, EMPTY_EMPLOYEE_FORM } from "./_admin_sections/adminShared";

type AdminSection = "items" | "employees" | "models" | "bom" | "packages" | "export" | "settings" | "departments";

const SECTIONS: { id: AdminSection; label: string; description: string; icon: ElementType }[] = [
  { id: "models", label: "모델", description: "제품 모델 추가/삭제", icon: Layers },
  { id: "items", label: "품목", description: "품목 기본 정보 수정", icon: PackagePlus },
  { id: "employees", label: "직원", description: "직원 활성 상태 관리", icon: Users },
  { id: "departments", label: "부서", description: "부서 추가/비활성화", icon: Building2 },
  { id: "bom", label: "BOM", description: "부모-자식 자재 구성", icon: Settings2 },
  { id: "packages", label: "출하묶음", description: "패키지 구성 관리", icon: ShieldCheck },
  { id: "export", label: "내보내기", description: "엑셀 데이터 내보내기", icon: FileDown },
];

const SETTINGS_ENTRY = { id: "settings" as AdminSection, label: "설정", description: "PIN, CSV, 초기화", icon: KeyRound };

function SectionHeader({
  icon: Icon,
  label,
  description,
  danger = false,
}: {
  icon: ElementType;
  label: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="mb-4 shrink-0">
      <div className="text-sm font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
        Workspace
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-[14px]"
          style={{
            background: danger
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)`,
            color: danger ? LEGACY_COLORS.red : LEGACY_COLORS.purple,
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-2xl font-black">{label} 관리</div>
        {danger && (
          <span
            className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <AlertTriangle className="h-3 w-3" />
            위험 영역
          </span>
        )}
      </div>
      <div className="mt-1 text-base" style={{ color: LEGACY_COLORS.muted2 }}>
        {description}
      </div>
    </div>
  );
}

function OverviewBar({
  items,
  employees,
  productModels,
  packages,
  allBomRows,
}: {
  items: Item[];
  employees: Employee[];
  productModels: ProductModel[];
  packages: ShipPackage[];
  allBomRows: BOMDetailEntry[];
}) {
  const belowMin = useMemo(
    () =>
      items.filter(
        (i) => i.min_stock != null && Number(i.quantity) < Number(i.min_stock),
      ).length,
    [items],
  );
  const stats = useMemo(
    () => [
      { label: "품목", value: items.length, color: LEGACY_COLORS.blue },
      { label: "직원", value: employees.length, color: LEGACY_COLORS.green },
      { label: "모델", value: productModels.length, color: LEGACY_COLORS.purple },
      { label: "출하묶음", value: packages.length, color: LEGACY_COLORS.cyan },
      { label: "BOM 구성", value: allBomRows.length, color: LEGACY_COLORS.yellow },
      { label: "안전재고 미달", value: belowMin, color: LEGACY_COLORS.red },
    ],
    [items.length, employees.length, productModels.length, packages.length, allBomRows.length, belowMin],
  );
  return (
    <div
      className="mb-4 shrink-0 flex flex-wrap gap-2 rounded-[20px] border px-4 py-3"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {stats.map(({ label, value, color }) => (
        <div
          key={label}
          className="flex items-center gap-1.5 rounded-[12px] px-3 py-1.5"
          style={{ background: `color-mix(in srgb, ${color} 10%, transparent)` }}
        >
          <span className="text-sm font-black" style={{ color }}>{formatNumber(value)}</span>
          <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SidebarButton({
  entry,
  active,
  onClick,
  danger = false,
}: {
  entry: { id: AdminSection; label: string; description: string; icon: ElementType };
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  const Icon = entry.icon;
  const tone = danger ? LEGACY_COLORS.red : LEGACY_COLORS.purple;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-colors hover:bg-white/[0.12]"
      style={{
        background: active
          ? `color-mix(in srgb, ${tone} ${danger ? 14 : 16}%, transparent)`
          : danger
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 5%, transparent)`
          : LEGACY_COLORS.s2,
        borderColor: active
          ? tone
          : danger
          ? `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`
          : LEGACY_COLORS.border,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]"
        style={{
          background: active
            ? tone
            : danger
            ? `color-mix(in srgb, ${LEGACY_COLORS.red} 18%, transparent)`
            : LEGACY_COLORS.s1,
          color: active ? "#fff" : danger ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div
          className="text-base font-bold truncate"
          style={danger ? { color: LEGACY_COLORS.red } : undefined}
        >
          {entry.label}
        </div>
        <div className="mt-0.5 text-xs leading-4 truncate" style={{ color: LEGACY_COLORS.muted2 }}>
          {entry.description}
        </div>
      </div>
    </button>
  );
}

export function DesktopAdminView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<AdminSection>("items");
  const [showRightPanel, setShowRightPanel] = useState(false);

  // 외부 데이터 (3개 섹션이 공유) — DesktopAdminView 가 한 번만 fetch
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [allBomRows, setAllBomRows] = useState<BOMDetailEntry[]>([]);
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);

  // 위젯 외 상태
  const [message, setMessage] = useState("");
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // BOM/Packages/MasterItems/Employees/Models 의 모든 state·액션은
  // 각자의 *Provider 안에서 관리한다 (useAdminBom / useAdminPackages / useAdminMasterItems /
  //  useAdminEmployees / useAdminModels). DesktopAdminView 는 데이터 + 콜백만 제공.

  async function loadData() {
    setMessage("");
    const [nextItems, nextEmployees, nextPackages, nextModels, nextDepts] = await Promise.all([
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getEmployees({ activeOnly: false }),
      api.getShipPackages(),
      api.getModels(),
      api.getDepartments(),
    ]);
    setItems(nextItems);
    setEmployees(nextEmployees);
    setPackages(nextPackages);
    setProductModels(nextModels);
    setDepartments(nextDepts);
    onStatusChange(`관리자 데이터를 불러왔습니다. 품목 ${nextItems.length}건 / 직원 ${nextEmployees.length}명`);
  }

  useEffect(() => {
    if (!unlocked) return;
    void loadData().catch((nextError) =>
      setMessage(nextError instanceof Error ? nextError.message : "관리자 데이터를 불러오지 못했습니다."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, globalSearch]);

  function refreshAllBom() {
    void api.getAllBOM().then(setAllBomRows).catch(() => setAllBomRows([]));
  }

  useEffect(() => {
    if (!unlocked) return;
    refreshAllBom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  function showSave(text: string) {
    setSaveMessage(text);
    setTimeout(() => setSaveMessage(null), 2500);
  }

  // BOM, Packages, MasterItems, Employees, Models 의 모든 액션은 각 훅 내부에 있다.

  async function changePin() {
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      setMessage("새 PIN과 확인 PIN이 일치하지 않습니다.");
      return;
    }
    await api.updateAdminPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
    setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
    setMessage("관리자 PIN을 변경했습니다.");
    onStatusChange("관리자 PIN을 변경했습니다.");
  }

  async function resetDatabase() {
    await api.resetDatabase(resetPin);
    setResetPin("");
    await loadData();
    setMessage("시드 기준으로 데이터를 다시 적재했습니다.");
    onStatusChange("시드 기준으로 데이터를 다시 적재했습니다.");
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <div
          className="w-full max-w-[460px] rounded-[32px] border p-6"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            boxShadow: "var(--c-card-shadow)",
          }}
        >
          <PinLock onUnlocked={() => setUnlocked(true)} />
        </div>
      </div>
    );
  }

  const activeSection = SECTIONS.find((entry) => entry.id === section) ?? (section === "settings" ? SETTINGS_ENTRY : undefined);

  const SECTION_GROUPS: { title: string; ids: AdminSection[] }[] = [
    { title: "기준정보", ids: ["models", "items", "employees", "departments"] },
    { title: "구성관리", ids: ["bom", "packages"] },
    { title: "시스템", ids: ["export"] },
  ];

  return (
    <div className="flex min-h-0 flex-1 gap-4 pl-0 pr-4">
      <div
        className="grid min-h-0 flex-1 gap-4"
        style={{ gridTemplateColumns: "220px minmax(0,1fr)", transition: "grid-template-columns 0.2s ease" }}
      >
        {/* 사이드바 */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          <div className="mb-3 shrink-0">
            <div className="text-sm font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
              Admin Menu
            </div>
            <div className="mt-1 flex items-center gap-2 text-xl font-black">
              관리자 모드
              <span
                className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
                  color: LEGACY_COLORS.green,
                }}
              >
                <ShieldCheck className="h-3 w-3" />
                활성
              </span>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {SECTION_GROUPS.map((group) => (
              <div key={group.title}>
                <div
                  className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.24em]"
                  style={{ color: LEGACY_COLORS.purple, opacity: 0.8 }}
                >
                  {group.title}
                </div>
                <div className="flex flex-col gap-2">
                  {SECTIONS.filter((e) => group.ids.includes(e.id)).map((entry) => (
                    <SidebarButton
                      key={entry.id}
                      entry={entry}
                      active={section === entry.id}
                      onClick={() => setSection(entry.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 shrink-0 flex flex-col gap-2">
            <SidebarButton
              entry={SETTINGS_ENTRY}
              active={section === SETTINGS_ENTRY.id}
              onClick={() => setSection(SETTINGS_ENTRY.id)}
              danger
            />
            <button
              onClick={() => setUnlocked(false)}
              className="w-full rounded-[16px] border px-3 py-2.5 text-xs font-semibold transition-colors hover:bg-white/10"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
            >
              관리자 잠금
            </button>
          </div>
        </section>

        {/* 워크스페이스 */}
        <section className="card flex min-h-0 flex-col overflow-hidden">
          {/* 고정 헤더 */}
          <div className="mb-4 shrink-0">
            {activeSection && (
              <div className="flex items-start justify-between">
                <SectionHeader
                  icon={activeSection.icon}
                  label={activeSection.label}
                  description={activeSection.description}
                  danger={section === "settings"}
                />
                <button
                  onClick={() => setShowRightPanel((v) => !v)}
                  className="mt-1 ml-2 shrink-0 flex items-center justify-center rounded-[12px] border p-2 transition-colors hover:bg-white/10"
                  style={{
                    background: showRightPanel
                      ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)`
                      : LEGACY_COLORS.s2,
                    borderColor: showRightPanel ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                    color: showRightPanel ? LEGACY_COLORS.purple : LEGACY_COLORS.muted2,
                  }}
                  title="요약 패널"
                >
                  <PanelRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {section === "items" && (
              <OverviewBar
                items={items}
                employees={employees}
                productModels={productModels}
                packages={packages}
                allBomRows={allBomRows}
              />
            )}
            {saveMessage && (
              <div
                className="mb-4 rounded-[16px] border px-4 py-3 text-sm font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.green} 40%, transparent)`,
                  color: LEGACY_COLORS.green,
                }}
              >
                {saveMessage}
              </div>
            )}
            {message ? (
              <div className="mt-3 text-base" style={{ color: LEGACY_COLORS.red }}>{message}</div>
            ) : null}
          </div>

          {/* 섹션별 콘텐츠 */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {section === "items" && (
              <AdminMasterItemsProvider
                items={items}
                setItems={setItems}
                globalSearch={globalSearch}
                onStatusChange={onStatusChange}
                onError={(m) => setMessage(m)}
                onShowSave={showSave}
              >
                <AdminMasterItemsSection />
              </AdminMasterItemsProvider>
            )}
            {section === "employees" && (
              <AdminEmployeesProvider
                employees={employees}
                setEmployees={setEmployees}
                departments={departments}
                onStatusChange={onStatusChange}
                onError={(m) => setMessage(m)}
              >
                <AdminEmployeesSection />
              </AdminEmployeesProvider>
            )}
            {section === "bom" && (
              <AdminBomProvider
                items={items}
                allBomRows={allBomRows}
                refreshAllBom={refreshAllBom}
                onStatusChange={onStatusChange}
                onError={(m) => setMessage(m)}
              >
                <AdminBomSection />
              </AdminBomProvider>
            )}
            {section === "packages" && (
              <AdminPackagesProvider
                items={items}
                packages={packages}
                setPackages={setPackages}
                onStatusChange={onStatusChange}
                onError={(m) => setMessage(m)}
              >
                <AdminPackagesSection />
              </AdminPackagesProvider>
            )}
            {section === "models" && (
              <AdminModelsProvider
                productModels={productModels}
                setProductModels={setProductModels}
                onStatusChange={onStatusChange}
                onError={(m) => setMessage(m)}
              >
                <AdminModelsSection />
              </AdminModelsProvider>
            )}
            {section === "departments" && (
              <AdminDepartmentsProvider
                departments={departments}
                setDepartments={setDepartments}
                onStatusChange={onStatusChange}
                onError={(m: string) => setMessage(m)}
              >
                <AdminDepartmentsSection />
              </AdminDepartmentsProvider>
            )}
            {section === "export" && (
              <AdminExportSection
                itemsExportUrl={api.getItemsExportUrl()}
                transactionsExportUrl={api.getTransactionsExportUrl()}
              />
            )}
            {section === "settings" && (
              <AdminDangerZone
                pinForm={pinForm}
                setPinForm={setPinForm}
                resetPin={resetPin}
                setResetPin={setResetPin}
                onChangePin={() => void changePin()}
                onResetDatabase={() => void resetDatabase()}
              />
            )}
          </div>
        </section>
      </div>

      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: showRightPanel ? 420 : 0,
          transition: "width 160ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="h-full pl-4"
          style={{
            opacity: showRightPanel ? 1 : 0,
            transform: showRightPanel ? "translateX(0)" : "translateX(18px)",
            transition: "opacity 260ms ease, transform 260ms ease",
            willChange: "transform, opacity",
          }}
        >
          <DesktopRightPanel title="관리 요약" subtitle="현재 작업 중인 관리자 영역의 핵심 수치를 요약합니다.">
            <div className="space-y-4">
              <div
                className="rounded-[28px] border p-5 text-base leading-6"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                {section === "items" && "품목 섹션에서는 이름, 바코드, 공급처, 모델 정보를 바로 수정할 수 있습니다."}
                {section === "employees" && "직원 섹션에서는 직원의 운영 상태를 빠르게 전환할 수 있습니다."}
                {section === "bom" && "BOM 섹션에서는 상위 품목을 기준으로 하위 자재를 추가하거나 제거할 수 있습니다."}
                {section === "packages" && "출하묶음 섹션에서는 패키지를 만들고 구성 품목을 빠르게 추가할 수 있습니다."}
                {section === "export" && "엑셀 내보내기 섹션에서 품목·거래 데이터를 엑셀 파일로 다운로드할 수 있습니다."}
                {section === "settings" && "설정 섹션에서는 관리자 PIN 변경, 초기화를 관리합니다."}
                {section === "departments" && "부서 섹션에서는 부서를 추가하거나 비활성화할 수 있습니다."}
              </div>
              <div
                className="rounded-[28px] border p-5"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
              >
                <div className="mb-3 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  현재 상태
                </div>
                <div className="space-y-2 text-base">
                  <div>품목 {formatNumber(items.length)}건</div>
                  <div>직원 {formatNumber(employees.length)}명</div>
                  <div>출하묶음 {formatNumber(packages.length)}건</div>
                  <div>BOM {formatNumber(allBomRows.length)}건</div>
                </div>
              </div>
            </div>
          </DesktopRightPanel>
        </div>
      </div>
    </div>
  );
}
