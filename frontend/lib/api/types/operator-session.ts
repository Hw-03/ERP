import type { Employee } from "./employees";

export interface OperatorSessionResponse {
  employee: Employee;
  server_time: string;
  expires_at: string;
  boot_id: string;
  /** 브라우저가 응답 본문을 받은 시각. 네트워크 뒤 채택되어도 서버 TTL을 늘리지 않는다. */
  client_received_at_ms?: number;
}
