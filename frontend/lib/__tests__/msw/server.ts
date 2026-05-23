import { setupServer } from "msw/node";
import { modelsHandlers } from "./handlers/models";
import { departmentsHandlers } from "./handlers/departments";

export const server = setupServer(
  ...modelsHandlers,
  ...departmentsHandlers,
  // 도메인 핸들러 점진 추가
);
