import { setupServer } from "msw/node";
import { modelsHandlers } from "./handlers/models";

export const server = setupServer(
  ...modelsHandlers,
  // 도메인 핸들러 점진 추가
);
