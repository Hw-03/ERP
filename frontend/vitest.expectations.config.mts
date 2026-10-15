import { mergeConfig } from "vitest/config";
import base from "./vitest.config.mts";

// Vitest 2 exposes locations only through configuration, not its CLI flags.
export default mergeConfig(base, {
  test: { includeTaskLocation: true, retry: 0, allowOnly: false },
});
