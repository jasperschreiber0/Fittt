import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
const [account] = JSON.parse(fs.readFileSync(".env.e2e.json", "utf8"));
const base =
  process.env.E2E_BASE_URL || "https://fittt-production.up.railway.app";
let jar = [];
const s = createServerClient(
  "https://mhsygkmdfrpkmhohieql.supabase.co",
  "sb_publishable_oKevlJ0WHzWlKRxvuzoUFA_rMpURFP0",
  {
    cookies: {
      getAll: () => jar,
      setAll: (values) => {
        jar = values;
      },
    },
  },
);
async function request(body) {
  return fetch(base + "/api/push", {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const endpoint =
  "https://fcm.googleapis.com/fcm/send/fittt-invalid-test-" +
  crypto.randomUUID();
try {
  const { error } = await s.auth.signInWithPassword(account);
  assert.equal(error, null);
  const config = await request();
  assert.equal(config.status, 200);
  assert.ok((await config.json()).publicKey);
  const curve = crypto.createECDH("prime256v1");
  curve.generateKeys();
  const sub = {
    action: "save",
    endpoint,
    p256dh: curve.getPublicKey().toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
    timezone: "Australia/Sydney",
    lunch: false,
    evening: false,
  };
  assert.equal((await request(sub)).status, 200);
  const settings = await (await request()).json();
  assert.deepEqual(
    settings.subscriptions.find((s) => s.endpoint === endpoint),
    { endpoint, lunch: false, evening: false, timezone: "Australia/Sydney" },
  );
  assert.equal(
    (await request({ ...sub, endpoint: "https://127.0.0.1/" })).status,
    400,
  );
  assert.equal((await request({ action: "remove", endpoint })).status, 200);
  assert.equal((await fetch(base + "/api/push")).status, 401);
  console.log(
    "PASS: production public-key configuration, authenticated save/read/delete, paused preferences, private-endpoint rejection and unauthenticated denial. No notifications sent.",
  );
} finally {
  await request({ action: "remove", endpoint }).catch(() => {});
  await s.auth.signOut({ scope: "local" });
}
