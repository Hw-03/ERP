import { makeClientRequestId } from "@/lib/uuid";

export const CATEGORIES = ["normal", "defect", "b_grade", "obsolete"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Quantities = Record<Category, number | null>;
export type DraftCount = {
  count_id: string; owner_id: string; version: number; fence: number; status: string; quantities: Quantities;
  owner_name?: string; confirmed_at?: string | null;
};
type SaveBody = { expected_version: number; fence: number; quantities: Quantities };
type Values = Record<Category, string>;
const valuesOf = (count: DraftCount): Values => Object.fromEntries(CATEGORIES.map((key) => [key, count.quantities[key]?.toString() ?? ""])) as Values;

/** One count's serialized save queue: server refreshes never overwrite unsaved observations. */
export class CountDraft {
  count: DraftCount;
  values: Values;
  dirty = false;
  saving = false;
  error: Error | null = null;
  remote: DraftCount | null = null;
  ambiguous = false;
  private edits = 0;
  private running: Promise<void> | null = null;
  private pending: { key: string; body: SaveBody; edit: number } | null = null;
  private deferredRemote: DraftCount | null = null;
  private listeners = new Set<() => void>();
  constructor(count: DraftCount, private save: (body: SaveBody, key: string) => Promise<DraftCount>, private sameActor: () => boolean) {
    this.count = count;
    this.values = valuesOf(count);
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private emit(): void { this.listeners.forEach((listener) => listener()); }
  get pendingKey(): string | null { return this.pending?.key ?? null; }

  edit(category: Category, value: string): void {
    this.values = { ...this.values, [category]: value };
    this.edits += 1;
    this.dirty = true;
    if (!this.ambiguous && !this.remote) this.error = null;
    this.emit();
  }
  receive(count: DraftCount): void {
    if (count.count_id !== this.count.count_id || count.version < this.count.version) return;
    if (count.version === this.count.version && count.status === this.count.status && count.fence === this.count.fence) return;
    if (this.saving) { this.deferredRemote = count; return; }
    if (this.dirty || this.ambiguous) {
      this.remote = count;
      this.error = new Error("다른 변경이 있습니다. 내 입력과 서버 값을 비교해 주세요.");
    } else {
      this.count = count;
      this.values = valuesOf(count);
    }
    this.emit();
  }
  acceptServer(): void {
    if (!this.remote || this.saving || this.ambiguous) return;
    this.count = this.remote;
    this.values = valuesOf(this.remote);
    this.remote = null;
    this.dirty = false;
    this.error = null;
    this.emit();
  }
  private quantities(): Quantities {
    const entries = CATEGORIES.map((key) => {
      const text = this.values[key];
      if (text !== "" && (!/^\d+$/.test(text) || Number(text) > 2147483647)) throw new Error("수량은 0 이상의 정수로 입력해 주세요.");
      return [key, text === "" ? null : Number(text)];
    });
    const result = Object.fromEntries(entries) as Quantities;
    if (CATEGORIES.reduce((sum, key) => sum + (result[key] ?? 0), 0) > 2147483647) throw new Error("네 분류 합계가 허용 범위를 초과합니다.");
    return result;
  }
  /** Repeated callers share one queue, including edits made while the first request was in flight. */
  flush(): Promise<void> {
    if (this.running) return this.running;
    const operation = this.flushQueue();
    this.running = operation;
    void operation.finally(() => { this.running = null; }).catch(() => {});
    return operation;
  }
  private async flushQueue(): Promise<void> {
    try {
      if (this.ambiguous) throw new Error("저장 결과 확인이 필요합니다. 성공 영수증을 먼저 조회해 주세요.");
      if (this.remote) throw new Error("다른 변경이 있습니다. 서버 값을 확인해 주세요.");
      while (this.dirty) {
        if (!this.sameActor()) throw new Error("작업자가 변경되었거나 인증이 만료되었습니다. 입력을 보존하고 저장을 중단했습니다.");
        if (this.count.status !== "DRAFT") throw new Error("현재 계수 상태에서는 수정할 수 없습니다.");
        const body = { expected_version: this.count.version, fence: this.count.fence, quantities: this.quantities() };
        this.pending = { body, key: makeClientRequestId(), edit: this.edits };
        this.saving = true;
        this.error = null;
        this.emit();
        const pending = this.pending;
        let result: DraftCount;
        try { result = await this.save(body, pending.key); }
        catch (failure) {
          // Explicit recovery may settle the command while its original HTTP call is still running.
          if (this.pending !== pending) return;
          throw failure;
        }
        if (this.pending !== pending) return;
        this.resolveReceipt(result);
        if (this.remote) throw new Error("다른 변경이 있습니다. 서버 값을 확인해 주세요.");
      }
    } catch (failure) {
      this.error = failure instanceof Error ? failure : new Error("저장하지 못했습니다.");
      if ((failure as { code?: string })?.code === "COMMAND_RESULT_UNKNOWN"
          || (failure as { extra?: { command_pending?: boolean } })?.extra?.command_pending === true) this.ambiguous = true;
      if (!this.ambiguous) this.pending = null;
      throw this.error;
    } finally {
      this.saving = false;
      this.emit();
    }
  }
  /** Only an authenticated success receipt resolves an unknown request outcome. */
  resolveReceipt(count: DraftCount): void {
    if (!this.pending || count.count_id !== this.count.count_id) throw new Error("저장 영수증의 계수가 다릅니다.");
    const remote = this.remote;
    const deferred = this.deferredRemote;
    this.remote = null;
    this.deferredRemote = null;
    this.count = count;
    this.dirty = this.edits !== this.pending.edit;
    if (!this.dirty) this.values = valuesOf(count);
    this.pending = null;
    this.ambiguous = false;
    this.saving = false;
    this.error = null;
    // A realtime result can arrive before its receipt; retain only a genuinely newer conflict.
    if (remote) this.receive(remote);
    if (deferred) this.receive(deferred);
    this.emit();
  }

  /** Keep observed text and require a deliberate save after the server fences this key. */
  resolveNotApplied(key: string): void {
    if (this.pending?.key !== key) return;
    this.pending = null;
    this.ambiguous = false;
    this.saving = false;
    this.error = new Error("미반영으로 확정했습니다. 입력을 확인한 뒤 저장 다시 시도를 선택해 주세요.");
    this.emit();
  }
}
