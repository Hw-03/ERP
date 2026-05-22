"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface Props {
  onAddQuarantine: () => void;
  onAddRReturn: () => void;
  onAddRScrap: () => void;
}

export function DefectQuickActions({ onAddQuarantine, onAddRReturn, onAddRScrap }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        label="+ 새 격리 추가"
        tone={LEGACY_COLORS.red}
        onClick={onAddQuarantine}
      />
      <ActionButton
        label="+ R 바로 반품"
        tone={LEGACY_COLORS.yellow}
        onClick={onAddRReturn}
      />
      <ActionButton
        label="+ R 바로 폐기"
        tone={LEGACY_COLORS.purple}
        onClick={onAddRScrap}
      />
    </div>
  );
}

function ActionButton({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[12px] border px-4 py-2 text-sm font-black transition-colors hover:brightness-110"
      style={{
        background: tint(tone, 8),
        borderColor: tint(tone, 40),
        color: tone,
      }}
    >
      {label}
    </button>
  );
}
