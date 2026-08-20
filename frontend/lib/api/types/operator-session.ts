import type { Employee } from "./employees";

export interface OperatorSessionResponse {
  employee: Employee;
  expires_at: string;
  boot_id: string;
}
