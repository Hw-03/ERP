// crypto.randomUUID 는 보안 컨텍스트(HTTPS / localhost)에서만 정의됨.
// LAN IP (http://192.168.x.x) 같은 비보안 origin 에서는 undefined → 호출 시 TypeError.
// 동일 형식의 UUID v4 폴백을 제공해 직원 폰(HTTP) 에서도 안전하게 동작하게 한다.
export function makeClientRequestId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const randomByte = () =>
    cryptoApi?.getRandomValues(new Uint8Array(1))[0] ?? Math.random() * 256;
  return "10000000-1000-4000-8000-100000000000".replace(
    /[018]/g,
    (digit) => (
      +digit ^ (randomByte() & (15 >> (+digit / 4)))
    ).toString(16),
  );
}
