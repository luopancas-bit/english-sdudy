import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const baseEnvironment = {
  SESSION_SECRET: "test-secret-with-at-least-32-characters",
};

describe("session cookie configuration", () => {
  it("defaults to secure cookies in production", () => {
    expect(loadConfig({ ...baseEnvironment, NODE_ENV: "production" }).SESSION_COOKIE_SECURE).toBe(true);
  });

  it("allows an explicit trusted-LAN HTTP override", () => {
    expect(
      loadConfig({
        ...baseEnvironment,
        NODE_ENV: "production",
        SESSION_COOKIE_SECURE: "false",
      }).SESSION_COOKIE_SECURE,
    ).toBe(false);
  });
});
