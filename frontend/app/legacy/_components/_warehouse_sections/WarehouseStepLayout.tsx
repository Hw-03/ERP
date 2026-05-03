"use client";

import {
  ExecuteStep,
  ItemPickStep,
  QuantityStep,
  WizardStepCard,
  WorkTypeStep,
} from "../_warehouse_steps";
import {
  AnimatedReveal,
  type WarehouseStepLayoutProps,
} from "./warehouseStepLayoutTypes";

/**
 * Round-13 (#17) — WarehouseStepLayout 슬림화. types/AnimatedReveal 은 별도 파일.
 */
export function WarehouseStepLayout({
  wizard: w,
  filter: f,
  availableWorkTypes,
  refs,
  step2Summary,
  step2Accent,
  onChangeWorkType,
  onEditStep2,
  itemsSummary,
  selectedItems,
  selectedPackage,
  onToggleItem,
  onSelectPackage,
  productModels,
  pendingScrollId,
  onScrolled,
  accent,
  selectedEntries,
  isOutbound,
  onQuantityChange,
  onRemoveItem,
  onClearPackage,
  notes,
  setNotes,
  totalQty,
  shortLabel,
  canExecute,
  isCaution,
  blockerText,
  submitting,
  onSubmit,
}: WarehouseStepLayoutProps) {
  return (
    <>
      {/* 1단계: 작업 유형 */}
      <div ref={refs.step2Ref} style={{ scrollMarginTop: 56 }}>
        <WizardStepCard
          n={1}
          title={w.step2State === "active" ? "작업 유형을 선택하세요" : "작업 유형"}
          state={w.step2State}
          summary={step2Summary}
          onChange={w.step2State === "complete" ? onEditStep2 : undefined}
          accent={step2Accent}
        >
          <WorkTypeStep
            workType={w.workType}
            onWorkTypeChange={onChangeWorkType}
            rawDirection={w.rawDirection}
            setRawDirection={w.changeRawDir}
            warehouseDirection={w.warehouseDirection}
            setWarehouseDirection={w.changeWarehouseDir}
            deptDirection={w.deptDirection}
            setDeptDirection={w.changeDeptDir}
            selectedDept={w.selectedDept}
            setSelectedDept={w.changeSelectedDept}
            defectiveSource={w.defectiveSource}
            setDefectiveSource={w.changeDefectiveSource}
            availableWorkTypes={availableWorkTypes}
            ready={w.step2Ready}
            onConfirm={w.confirmStep2}
          />
        </WizardStepCard>
      </div>

      {/* 2단계: 품목 선택 */}
      <AnimatedReveal show={w.showStep3}>
        <div ref={refs.step3Ref} style={{ scrollMarginTop: 56, paddingBottom: 4 }}>
          <WizardStepCard
            n={2}
            title={w.hasItems ? `품목 ${itemsSummary}` : "품목을 선택하세요"}
            state="active"
          >
            <ItemPickStep
              workType={w.workType}
              filteredItems={f.filteredItems}
              filteredPackages={f.filteredPackages}
              selectedItems={selectedItems}
              selectedPackage={selectedPackage}
              onToggleItem={onToggleItem}
              onSelectPackage={onSelectPackage}
              productModels={productModels}
              dept={f.dept}
              setDept={f.setDept}
              modelFilter={f.modelFilter}
              setModelFilter={f.setModelFilter}
              stageFilter={f.stageFilter}
              setStageFilter={f.setStageFilter}
              localSearch={f.localSearch}
              setLocalSearch={f.setLocalSearch}
              displayLimit={f.displayLimit}
              setDisplayLimit={f.setDisplayLimit}
              hiddenSelectedCount={f.hiddenSelectedCount}
              hasActiveFilter={f.hasActiveFilter}
              clearFilters={f.clearFilters}
              pendingScrollId={pendingScrollId}
              onScrolled={onScrolled}
            />
          </WizardStepCard>
        </div>
      </AnimatedReveal>

      {/* 3단계: 수량 · 메모 */}
      <AnimatedReveal show={w.showStep4}>
        <div ref={refs.step4Ref} style={{ scrollMarginTop: 56, paddingBottom: 4 }}>
          <WizardStepCard n={3} title="수량 · 메모" state="active" accent={accent}>
            <QuantityStep
              workType={w.workType}
              selectedEntries={selectedEntries}
              isOutbound={isOutbound}
              selectedPackage={selectedPackage}
              onQuantityChange={onQuantityChange}
              onRemove={onRemoveItem}
              onClearPackage={onClearPackage}
              notes={notes}
              setNotes={setNotes}
              totalQty={totalQty}
            />
          </WizardStepCard>
        </div>
      </AnimatedReveal>

      {/* 4단계: 실행 */}
      <AnimatedReveal show={w.showStep5}>
        <div style={{ paddingBottom: 4 }}>
          <WizardStepCard n={4} title="실행" state="active" accent={accent}>
            <ExecuteStep
              shortLabel={shortLabel}
              workType={w.workType}
              selectedEntries={selectedEntries}
              canExecute={canExecute}
              isCaution={isCaution}
              accent={accent}
              blockerText={blockerText}
              submitting={submitting}
              onSubmit={onSubmit}
            />
          </WizardStepCard>
        </div>
      </AnimatedReveal>
    </>
  );
}
