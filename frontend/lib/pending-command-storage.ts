const inFlight: Record<string, Promise<unknown> | undefined> = {};

function storage(key: string, value?: unknown): unknown {
  try {
    if (value === undefined) {
      return JSON.parse(sessionStorage[key] || "null");
    }
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage[key] = JSON.stringify(value);
  } catch {
    // 저장소를 사용할 수 없는 환경에서는 현재 요청을 그대로 보낸다.
  }
  return value;
}

/** 결과 불명 명령의 exact 요청을 성공 또는 확정 4xx까지 보존한다. */
export function runPendingCommand<T, R>(
  key: string,
  currentRequest: T,
  execute: (request: T) => Promise<R>,
): Promise<R> {
  const active = inFlight[key];
  if (active) return active as Promise<R>;
  const pending = (async () => {
    const request = (storage(key) as T | null) || currentRequest;
    storage(key, request);
    try {
      const result = await execute(request);
      storage(key, null);
      return result;
    } catch (error) {
      const status = (error as { status: number }).status;
      if (status >= 400 && status < 500 && ![408, 425, 429].includes(status)) {
        storage(key, null);
      }
      throw error;
    }
  })().finally(() => delete inFlight[key]);
  inFlight[key] = pending;
  return pending;
}

/** A confirmed inverse transition makes an older unknown command obsolete. */
export function clearPendingCommand(key: string): void {
  storage(key, null);
}
