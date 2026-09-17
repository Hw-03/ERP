"use client";
import styles from "./RecoveryScreen.module.css";

/** 루트 레이아웃이 실패해도 provider나 전역 스타일 없이 복구 버튼을 제공한다. */
export function RecoveryScreen({ title, description, onRetry }: {
  title: string; description: string; onRetry?: () => void;
}) {
  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="recovery-title">
      <div className={styles.brand}>DEXCOWIN MES</div>
      <h1 id="recovery-title" className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
      <div className={styles.actions}>
        {onRetry && <button type="button" className={styles.action} onClick={onRetry}>다시 시도</button>}
        <a className={styles.action} href="/mes?tab=dashboard">대시보드로</a>
      </div>
    </section>
  </main>;
}
