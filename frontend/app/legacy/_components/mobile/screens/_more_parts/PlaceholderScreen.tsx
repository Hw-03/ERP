"use client";

import { Clock, type LucideIcon } from "lucide-react";
import { EmptyState, SubScreenHeader } from "../../primitives";

export function PlaceholderScreen({
  title,
  subtitle,
  icon,
  phaseLabel,
  description,
  onBack,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  phaseLabel: string;
  description?: string;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <SubScreenHeader title={title} subtitle={subtitle} onBack={onBack} />
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <EmptyState
          icon={icon ?? Clock}
          title={`${phaseLabel} 예정`}
          description={
            description ??
            "현재는 데스크탑에서 사용해 주세요. 다음 단계에서 모바일에 추가됩니다."
          }
        />
      </div>
    </div>
  );
}
