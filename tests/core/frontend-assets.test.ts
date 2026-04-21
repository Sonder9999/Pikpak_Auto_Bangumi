import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { resolve } from "path";
import { resolveFrontendDistDir } from "../../src/server/frontend-assets.ts";

describe("frontend assets path", () => {
  let originalCwd = process.cwd();

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  test("resolves the frontend dist directory independently from cwd", () => {
    process.chdir(resolve(originalCwd, "src"));

    const distDir = resolveFrontendDistDir();

    expect(distDir).toBe(resolve(originalCwd, "frontend", "dist"));
    expect(existsSync(distDir)).toBe(true);
  });
});
