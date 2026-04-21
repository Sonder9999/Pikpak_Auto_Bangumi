import { resolve } from "path";

export function resolveFrontendDistDir() {
  return resolve(import.meta.dir, "../../frontend/dist");
}
