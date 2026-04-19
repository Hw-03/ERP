"use client";

import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { DatabaseBackup, FileDown, KeyRound, PackagePlus, Settings2, ShieldCheck, Users } from "lucide-react";
import { api, type BOMEntry, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { PinLock } from "./PinLock";
import { DEPARTMENT_LABELS, LEGACY_COLORS, buildItemSearchLabel, formatNumber, normalizeDepartment } from "./legacyUi";

type AdminSection = "items" | "employees" | "bom" | "packages" | "settings";

const SECTIONS: { id: AdminSection; label: string; icon: ElementType; accent: string; subtitle: string }[] = [
  { id: "items", label: "상품", icon: PackagePlus, accent: LEGACY_COLORS.blue, subtitle: "품목 메타와 재고 기준값" },
  { id: "employees", label: "직원", icon: Users, accent: LEGACY_COLORS.green, subtitle: "권한과 활성 상태" },
  { id: "bom", label: "BOM", icon: Settings2, accent: LEGACY_COLORS.purple, subtitle: "상하위 구성 관리" },
  { id: "packages", label: "출하묶음", icon: ShieldCheck, accent: LEGACY_COLORS.yellow, subtitle: "패키지 구성 품목" },
  { id: "settings", label: "설정", icon: KeyRound, accent: LEGACY_COLORS.red, subtitle: "PIN, 내보내기, 초기화" },
];

function SectionButton({
  active,
  accent,
  icon: Icon,
  label,
  subtitle,
  onClick,
}: {
  active: boolean;
  accent: string;
  icon: ElementType;
  label: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[22px] border px-4 py-4 text-left transition"
      style={{
        background: active ? `color-mix(in srgb, ${accent} 16%, ${LEGACY_COLORS.s2})` : LEGACY_COLORS.s2,
        borderColor: active ? LEGACY_COLORS.borderStrong : LEGACY_COLORS.border,
      }}
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ background: active ? accent : LEGACY_COLORS.s1, color: active ? "#fff" : LEGACY_COLORS.muted2 }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className="mt-0.5 text-xs leading-5" style={{ color: LEGACY_COLORS.muted2 }}>
          {subtitle}
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
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ShipPackage | null>(null);
  const [parentId, setParentId] = useState("");
  const [bomRows, setBomRows] = useState<BOMEntry[]>([]);
  const [message, setMessage] = useState("");
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");

  async function loadData() {
    const [nextItems, nextEmployees, nextPackages] = await Promise.all([
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      api.getEmployees(),
      api.getShipPackages(),
    ]);
    setItems(nextItems);
    setEmployees(nextEmployees);
    setPackages(nextPackages);
    if (!parentId && nextItems[0]) setParentId(nextItems[0].item_id);
    onStatusChange(`관리자 데이터를 불러왔습니다. 품목 ${nextItems.length}건 / 직원 ${nextEmployees.length}명`);
  }

  useEffect(() => {
    if (!unlocked) return;
    void loadData().catch((nextError) => setMessage(nextError instanceof Error ? nextError.message : "관리자 데이터를 불러오지 못했습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, globalSearch]);

  useEffect(() => {
    if (!parentId) return;
    void api.getBOM(parentId).then(setBomRows).catch(() => setBomRows([]));
  }, [parentId]);

  const visibleItems = useMemo(() => {
    if (!globalSearch.trim()) return items.slice(0, 140);
    const keyword = globalSearch.toLowerCase();
    return items.filter((item) => `${item.item_name} ${item.item_code}`.toLowerCase().includes(keyword)).slice(0, 140);
  }, [globalSearch, items]);

  const quickItems = useMemo(() => items.slice(0, 40), [items]);
  const currentSection = SECTIONS.find((entry) => entry.id === section)!;

  async function saveItemField(field: keyof Pick<Item, "item_name" | "spec" | "barcode" | "legacy_model" | "supplier">, value: string) {
    if (!selectedItem) return;
    const updated = await api.updateItem(selectedItem.item_id, { [field]: value || undefined });
    setItems((current) => current.map((item) => (item.item_id === updated.item_id ? updated : item)));
    setSelectedItem(updated);
    onStatusChange(`${updated.item_name} 정보를 저장했습니다.`);
  }

  async function toggleEmployee(employee: Employee) {
    const updated = await api.updateEmployee(employee.employee_id, { is_active: !employee.is_active });
    setEmployees((current) => current.map((entry) => (entry.employee_id === employee.employee_id ? updated : entry)));
    setSelectedEmployee(updated);
    onStatusChange(`${updated.name} 직원 상태를 변경했습니다.`);
  }

  async function createSimplePackage() {
    const created = await api.createShipPackage({
      package_code: `PKG-${Date.now()}`,
      name: `출하묶음 ${packages.length + 1}`,
    });
    setPackages((current) => [...current, created]);
    setSelectedPackage(created);
    onStatusChange(`${created.name} 출하묶음을 생성했습니다.`);
  }

  async function addPackageItem(itemId: string) {
    if (!selectedPackage) return;
    const updated = await api.addShipPackageItem(selectedPackage.package_id, { item_id: itemId, quantity: 1 });
    setPackages((current) => current.map((entry) => (entry.package_id === updated.package_id ? updated : entry)));
    setSelectedPackage(updated);
    onStatusChange(`${updated.name}에 구성품을 추가했습니다.`);
  }

  async function addBomRow(childId: string) {
    if (!parentId) return;
    const created = await api.createBOM({ parent_item_id: parentId, child_item_id: childId, quantity: 1, unit: "EA" });
    setBomRows((current) => [...current, created]);
    onStatusChange("BOM 항목을 추가했습니다.");
  }

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
    setMessage("시드 기준값으로 데이터를 다시 적재했습니다.");
    onStatusChange("시드 기준값으로 데이터를 다시 적재했습니다.");
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-6">
        <div className="desktop-shell-panel w-full max-w-[440px] px-6 py-6">
          <PinLock onUnlocked={() => setUnlocked(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-5 px-6 py-6">
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-5">
        <section
          className="desktop-shell-panel flex min-h-0 flex-col px-5 py-5"
          style={{ background: `linear-gradient(180deg, ${LEGACY_COLORS.panel} 0%, ${LEGACY_COLORS.s1} 100%)`, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4">
            <div className="desktop-section-label mb-2">Admin Navigation</div>
            <div className="text-xl font-black">관리 섹션</div>
            <div className="mt-2 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
              상품, 직원, BOM, 출하묶음, 설정을 같은 패턴으로 관리합니다.
            </div>
          </div>

          <div className="space-y-3">
            {SECTIONS.map((entry) => (
              <SectionButton
                key={entry.id}
                active={section === entry.id}
                accent={entry.accent}
                icon={entry.icon}
                label={entry.label}
                subtitle={entry.subtitle}
                onClick={() => setSection(entry.id)}
              />
            ))}
          </div>

          <button onClick={() => setUnlocked(false)} className="desktop-action-secondary mt-auto w-full">
            관리자 잠금
          </button>
        </section>

        <section
          className="desktop-shell-panel min-h-0 overflow-hidden"
          style={{ background: `linear-gradient(180deg, ${LEGACY_COLORS.panel} 0%, ${LEGACY_COLORS.s1} 100%)`, borderColor: LEGACY_COLORS.border }}
        >
          <div className="border-b px-5 py-5" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="desktop-section-label mb-2">{currentSection.subtitle}</div>
            <div className="text-xl font-black">관리자 작업대</div>
            <div className="mt-2 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
              선택한 섹션에 맞는 목록과 편집 패널을 같은 구조로 유지합니다.
            </div>
            {message ? (
              <div className="mt-3 rounded-2xl border px-4 py-3 text-sm" style={{ background: LEGACY_COLORS.redSoft, borderColor: LEGACY_COLORS.borderStrong, color: LEGACY_COLORS.red }}>
                {message}
              </div>
            ) : null}
          </div>

          <div className="h-[calc(100vh-220px)] overflow-auto px-5 py-5">
            {section === "items" ? (
              <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-4">
                <div className="overflow-hidden rounded-[26px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {visibleItems.map((item) => (
                    <button key={item.item_id} onClick={() => setSelectedItem(item)} className="block w-full border-b px-4 py-4 text-left last:border-b-0 transition" style={{ borderColor: LEGACY_COLORS.border }}>
                      <div className="text-sm font-semibold">{item.item_name}</div>
                      <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{item.item_code}</div>
                    </button>
                  ))}
                </div>
                <div className="space-y-3 rounded-[26px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedItem ? (
                    <>
                      <div className="rounded-[22px] border p-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                        <div className="desktop-section-label mb-2">Item Summary</div>
                        <div className="text-lg font-bold">{selectedItem.item_name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{selectedItem.item_code}</div>
                      </div>
                      {([
                        ["item_name", selectedItem.item_name, "품목명"],
                        ["spec", selectedItem.spec || "", "사양"],
                        ["barcode", selectedItem.barcode || "", "바코드"],
                        ["legacy_model", selectedItem.legacy_model || "", "모델"],
                        ["supplier", selectedItem.supplier || "", "공급처"],
                      ] as [keyof Pick<Item, "item_name" | "spec" | "barcode" | "legacy_model" | "supplier">, string, string][]).map(([field, value, label]) => (
                        <div key={field}>
                          <div className="desktop-section-label mb-2 !tracking-[0.12em]">{label}</div>
                          <input
                            defaultValue={value}
                            onBlur={(event) => void saveItemField(field, event.target.value)}
                            className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[22px] border p-8 text-center text-sm leading-6" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}>
                      왼쪽 목록에서 상품을 선택하면 레거시 메타 필드까지 한 번에 수정할 수 있습니다.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {section === "employees" ? (
              <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
                <div className="overflow-hidden rounded-[26px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {employees.map((employee) => (
                    <button key={employee.employee_id} onClick={() => setSelectedEmployee(employee)} className="flex w-full items-center justify-between border-b px-4 py-4 text-left last:border-b-0 transition" style={{ borderColor: LEGACY_COLORS.border }}>
                      <div>
                        <div className="text-sm font-semibold">{employee.name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                          {employee.employee_code} / {normalizeDepartment(employee.department)}
                        </div>
                      </div>
                      <span style={{ color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.red }}>
                        {employee.is_active ? "활성" : "비활성"}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="rounded-[26px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedEmployee ? (
                    <>
                      <div className="mb-3 text-lg font-bold">{selectedEmployee.name}</div>
                      <div className="mb-4 text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                        {selectedEmployee.role} / {normalizeDepartment(selectedEmployee.department)}
                      </div>
                      <button onClick={() => void toggleEmployee(selectedEmployee)} className={selectedEmployee.is_active ? "desktop-action-danger w-full" : "desktop-action-primary w-full"}>
                        {selectedEmployee.is_active ? "비활성 전환" : "활성 전환"}
                      </button>
                    </>
                  ) : (
                    <div className="text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                      직원을 선택하면 현재 상태와 부서 정보를 확인하고 즉시 활성 상태를 변경할 수 있습니다.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {section === "bom" ? (
              <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-4">
                <div className="space-y-3 rounded-[26px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <select value={parentId} onChange={(event) => setParentId(event.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
                    {items.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_code} / {item.item_name}</option>)}
                  </select>
                  {quickItems.map((item) => (
                    <button key={item.item_id} onClick={() => void addBomRow(item.item_id)} className="block w-full rounded-2xl border px-4 py-3 text-left text-sm transition" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                      {buildItemSearchLabel(item)}
                    </button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-[26px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {bomRows.map((row) => (
                    <div key={row.bom_id} className="flex items-center justify-between border-b px-4 py-4 last:border-b-0" style={{ borderColor: LEGACY_COLORS.border }}>
                      <div>
                        <div className="text-sm font-semibold">{items.find((item) => item.item_id === row.child_item_id)?.item_name || row.child_item_id}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(row.quantity)} {row.unit}</div>
                      </div>
                      <button onClick={() => void api.deleteBOM(row.bom_id).then(() => setBomRows((current) => current.filter((entry) => entry.bom_id !== row.bom_id)))} className="text-sm font-semibold" style={{ color: LEGACY_COLORS.red }}>
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {section === "packages" ? (
              <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-4">
                <div className="space-y-3">
                  <button onClick={() => void createSimplePackage()} className="desktop-action-primary w-full">
                    새 출하묶음 생성
                  </button>
                  <div className="overflow-hidden rounded-[26px] border" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    {packages.map((pkg) => (
                      <button key={pkg.package_id} onClick={() => setSelectedPackage(pkg)} className="block w-full border-b px-4 py-4 text-left last:border-b-0 transition" style={{ borderColor: LEGACY_COLORS.border }}>
                        <div className="text-sm font-semibold">{pkg.name}</div>
                        <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{pkg.package_code} / {pkg.items.length}종</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[26px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  {selectedPackage ? (
                    <>
                      <div className="mb-3 text-lg font-bold">{selectedPackage.name}</div>
                      <div className="mb-4 space-y-2">
                        {selectedPackage.items.map((item) => (
                          <div key={item.package_item_id} className="rounded-2xl px-4 py-3" style={{ background: LEGACY_COLORS.s1 }}>
                            <div className="text-sm font-semibold">{item.item_name}</div>
                            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>{formatNumber(item.quantity)} {item.item_unit}</div>
                          </div>
                        ))}
                      </div>
                      {quickItems.map((item) => (
                        <button key={item.item_id} onClick={() => void addPackageItem(item.item_id)} className="mb-2 block w-full rounded-2xl border px-4 py-3 text-left text-sm transition" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                          {buildItemSearchLabel(item)}
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="text-sm leading-6" style={{ color: LEGACY_COLORS.muted2 }}>
                      왼쪽에서 출하묶음을 선택하면 현재 구성품과 추가 가능한 품목을 한 번에 표시합니다.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {section === "settings" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[26px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold"><KeyRound className="h-4 w-4" />관리자 PIN 변경</div>
                  {(Object.entries(pinForm) as [keyof typeof pinForm, string][]).map(([key, value]) => (
                    <input key={key} type="password" value={value} onChange={(event) => setPinForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={key} className="mb-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
                  ))}
                  <button onClick={() => void changePin()} className="desktop-action-primary w-full">
                    PIN 저장
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="rounded-[26px] border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold"><FileDown className="h-4 w-4" />CSV 내보내기</div>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={api.getItemsExportUrl()} download className="desktop-action-secondary text-center">품목 CSV</a>
                      <a href={api.getTransactionsExportUrl()} download className="desktop-action-secondary text-center">거래 CSV</a>
                    </div>
                  </div>
                  <div className="rounded-[26px] border p-4" style={{ background: LEGACY_COLORS.redSoft, borderColor: LEGACY_COLORS.borderStrong }}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.red }}><DatabaseBackup className="h-4 w-4" />위험 작업</div>
                    <div className="mb-3 text-sm leading-6" style={{ color: LEGACY_COLORS.textSoft }}>
                      데이터 재적재는 되돌릴 수 없는 작업입니다. 관리자 PIN으로 한 번 더 확인합니다.
                    </div>
                    <input type="password" value={resetPin} onChange={(event) => setResetPin(event.target.value)} placeholder="관리자 PIN" className="mb-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
                    <button onClick={() => void resetDatabase()} className="desktop-action-danger w-full">
                      시드 기준으로 다시 적재
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <DesktopRightPanel
        eyebrow="Admin Memo"
        title={currentSection.label}
        subtitle="현재 섹션에서 자주 하는 작업과 데이터 규모를 빠르게 요약합니다."
      >
        <div className="space-y-4">
          <div className="rounded-[28px] border p-5 text-sm leading-6" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            {section === "items" && "상품 섹션에서는 레거시 메타 필드와 공급처, 모델명을 한 화면에서 수정할 수 있습니다."}
            {section === "employees" && "직원 섹션에서는 활성 상태와 부서 정보를 빠르게 확인하고 전환할 수 있습니다."}
            {section === "bom" && "BOM 섹션에서는 상위 품목을 기준으로 하위 구성품을 빠르게 추가하거나 제거합니다."}
            {section === "packages" && "출하묶음 섹션에서는 패키지를 만들고 자주 쓰는 품목을 즉시 추가합니다."}
            {section === "settings" && "설정 섹션에서는 PIN 변경, CSV 내보내기, 데이터 재적재처럼 위험도에 따라 작업을 분리합니다."}
          </div>

          <div className="rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="desktop-section-label mb-3">현재 상태</div>
            <div className="space-y-2 text-sm">
              <div>품목 {formatNumber(items.length)}건</div>
              <div>직원 {formatNumber(employees.length)}명</div>
              <div>출하묶음 {formatNumber(packages.length)}건</div>
              <div>BOM {formatNumber(bomRows.length)}건</div>
              <div>부서 수 {formatNumber(Object.keys(DEPARTMENT_LABELS).length)}개</div>
            </div>
          </div>
        </div>
      </DesktopRightPanel>
    </div>
  );
}
