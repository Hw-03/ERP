import { pathToFileURL } from "node:url";
import guard from "./require-node-20.cjs";

export const { assertSupportedNodeVersion } = guard;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertSupportedNodeVersion(process.version);
}
