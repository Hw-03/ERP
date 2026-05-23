import { http, HttpResponse } from "msw";

const sampleEmployees = [
  {
    employee_id: "E001",
    employee_code: "E001",
    name: "홍길동",
    role: "조립",
    department: "조립",
    is_active: true,
    display_order: 0,
  },
  {
    employee_id: "E002",
    employee_code: "E002",
    name: "김철수",
    role: "포장",
    department: "포장",
    is_active: true,
    display_order: 1,
  },
];

export const employeesHandlers = [
  http.get("*/api/employees", () => HttpResponse.json(sampleEmployees)),

  http.post("*/api/employees", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      role: string;
      department: string;
    };
    return HttpResponse.json(
      {
        employee_id: "E003",
        employee_code: "E003",
        name: body.name,
        role: body.role,
        department: body.department,
        is_active: true,
        display_order: 2,
      },
      { status: 201 },
    );
  }),

  http.put("*/api/employees/:employeeId", async ({ params, request }) => {
    const body = (await request.json()) as { name?: string; is_active?: boolean };
    return HttpResponse.json({
      employee_id: String(params.employeeId),
      employee_code: String(params.employeeId),
      name: body.name ?? "홍길동",
      role: "조립",
      department: "조립",
      is_active: body.is_active ?? true,
      display_order: 0,
    });
  }),

  http.delete("*/api/employees/:employeeId", () =>
    HttpResponse.json({ result: "deleted" }),
  ),

  http.post("*/api/employees/:employeeId/reset-pin", async ({ request }) => {
    const body = (await request.json()) as { pin: string };
    if (body.pin !== "0000")
      return HttpResponse.json({ detail: "PIN 불일치" }, { status: 403 });
    return HttpResponse.json(null);
  }),
];
