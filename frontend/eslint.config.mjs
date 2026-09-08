import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  {
    name: "dexcowin/react-hooks-legacy-equivalence",
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      "@next/next/no-location-assign-relative-destination": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
