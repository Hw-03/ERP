import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import styles from "../AdminDepartmentsSection.module.css";

export function MetaCell({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}): ReactNode {
  return (
    <div
      className={styles.metaCell}
    >
      <div className="text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div
        className={`mt-2 text-[20px] font-black ${mono ? "font-mono" : ""}`}
        style={{ color: tone ?? LEGACY_COLORS.text }}
      >
        {value}
      </div>
    </div>
  );
}

export function DetailCardSlot({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div
      className={`border p-3 ${styles.detailSection} ${className ?? ""}`}
      style={{ borderColor: LEGACY_COLORS.border }}
    >
      <div className={styles.detailSectionTitle}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
