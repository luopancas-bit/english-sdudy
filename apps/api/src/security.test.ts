import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, normalizeUsername, verifyPassword } from "./security.js";

describe("account security", () => {
  it("stores a salted password hash and verifies only the original password", async () => {
    const stored = await hashPassword("a-long-test-password");
    expect(stored).not.toContain("a-long-test-password");
    await expect(verifyPassword("a-long-test-password", stored)).resolves.toBe(true);
    await expect(verifyPassword("a-different-password", stored)).resolves.toBe(false);
  });

  it("normalizes account names and hashes session tokens with the server secret", () => {
    expect(normalizeUsername("  Learner_01 ")).toBe("learner_01");
    expect(hashToken("token", "a".repeat(32))).not.toBe(hashToken("token", "b".repeat(32)));
  });
});
