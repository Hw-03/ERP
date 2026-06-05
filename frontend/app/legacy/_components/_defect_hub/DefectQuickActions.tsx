"use client";

import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/lib/ui/Button";

interface Props {
  onAddQuarantine: () => void;
  onAddRReturn: () => void;
  onAddRScrap: () => void;
}

export function DefectQuickActions({ onAddQuarantine, onAddRReturn, onAddRScrap }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* 주요 액션 하나만 강조(시스템 파랑) */}
      <Button variant="primary" iconLeft={<Plus />} onClick={onAddQuarantine}>
        새 불량 추가
      </Button>
      {/* 보조 액션은 중립 외곽선 */}
      <Button variant="secondary" iconLeft={<RotateCcw />} onClick={onAddRReturn}>
        R 바로 반품
      </Button>
      <Button variant="secondary" iconLeft={<Trash2 />} onClick={onAddRScrap}>
        R 바로 폐기
      </Button>
    </div>
  );
}
