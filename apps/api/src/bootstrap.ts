import { createDatabase, migrate } from "@zhuguang/database";
import { loadConfig } from "./config.js";
import { LearningRepository } from "./repository.js";
import { hashPassword, hashToken, newOpaqueToken, normalizeUsername } from "./security.js";

const config = loadConfig();
if (!config.BOOTSTRAP_ADMIN_USERNAME || !config.BOOTSTRAP_ADMIN_PASSWORD) {
  throw new Error("BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD are required");
}

const database = createDatabase(config.DATABASE_URL);
await migrate(database);
const repository = new LearningRepository(database);
const username = normalizeUsername(config.BOOTSTRAP_ADMIN_USERNAME);
let admin = await repository.findUserByUsername(username);
if (!admin) {
  admin = await repository.createUser({
    username,
    passwordHash: await hashPassword(config.BOOTSTRAP_ADMIN_PASSWORD),
    nickname: "管理员",
    role: "admin",
  });
}

const invitationCode = newOpaqueToken(12).toUpperCase();
const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 7);
await repository.createInvitation({
  codeHash: hashToken(invitationCode, config.SESSION_SECRET),
  createdBy: admin.id,
  expiresAt: expiresAt.toISOString(),
});

console.log(`Initial invitation code: ${invitationCode}`);
