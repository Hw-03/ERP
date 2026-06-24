// crypto.randomUUID 는 보안 컨텍스트(HTTPS / localhost)에서만 정의됨.
// LAN IP (http://192.168.x.x) 같은 비보안 origin 에서는 undefined → 호출 시 TypeError.
// 동일 형식의 UUID v4 폴백을 제공해 직원 폰(HTTP) 에서도 안전하게 동작하게 한다.
export function makeClientRequestId(): string {
  const g = globalThis as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
