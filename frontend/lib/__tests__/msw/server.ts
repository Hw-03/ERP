import { setupServer } from "msw/node";
import { modelsHandlers } from "./handlers/models";
import { departmentsHandlers } from "./handlers/departments";
import { transactionsHandlers } from "./handlers/transactions";
import { bomHandlers } from "./handlers/bom";
import { inventoryHandlers } from "./handlers/inventory";
import { settingsHandlers } from "./handlers/settings";
import { stockRequestsHandlers } from "./handlers/stock-requests";
import { productionHandlers } from "./handlers/production";
import { adminHandlers } from "./handlers/admin";

export const server = setupServer(
  ...modelsHandlers,
  ...departmentsHandlers,
  ...transactionsHandlers,
  ...bomHandlers,
  ...inventoryHandlers,
  ...settingsHandlers,
  ...stockRequestsHandlers,
  ...productionHandlers,
  ...adminHandlers,
);
