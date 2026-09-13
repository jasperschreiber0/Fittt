import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
const accounts = JSON.parse(fs.readFileSync(".env.e2e.json", "utf8"));
const clients = accounts
  .slice(0, 2)
  .map(() =>
    createClient(
      "https://mhsygkmdfrpkmhohieql.supabase.co",
      "sb_publishable_oKevlJ0WHzWlKRxvuzoUFA_rMpURFP0",
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
  );
try {
  for (let i = 0; i < 2; i++) {
    const { error } = await clients[i].auth.signInWithPassword(accounts[i]);
    assert.equal(error, null);
    const p = await clients[i]
      .from("fittt_profiles")
      .insert({ user_id: accounts[i].id, data: { name: "Push verification" } });
    assert.equal(p.error, null);
  }
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const endpoint =
    "https://fcm.googleapis.com/fcm/send/fittt-invalid-test-" +
    crypto.randomUUID();
  const keys = {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  };
  const vapid = webpush.generateVAPIDKeys(); // Offline encryption test needs no production signing secret.
  const payload = JSON.stringify({ title: "FITTT", body: "Synthetic test" });
  const request = webpush.generateRequestDetails({ endpoint, keys }, payload, {
    vapidDetails: {
      subject: "https://fittt-production.up.railway.app",
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
    },
    TTL: 900,
  });
  assert.equal(request.headers["Content-Encoding"], "aes128gcm");
  assert.equal(request.body.includes(Buffer.from(payload)), false);
  const timezone =
    Intl.supportedValuesOf("timeZone").find((zone) => {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat("en", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(new Date())
          .map((p) => [p.type, p.value]),
      );
      return ["12", "19"].includes(p.hour) && Number(p.minute) < 15;
    }) || "Australia/Sydney";
  // A recent synthetic check-in ensures the worker never sends this endpoint.
  const check = await clients[0]
    .from("fittt_days")
    .insert({
      user_id: accounts[0].id,
      day: new Date().toISOString().slice(0, 10),
      data: {
        complete: true,
        training: "rest",
        food: "on",
        alcohol: "none",
        minimum: false,
      },
    });
  assert.equal(check.error, null);
  const inserted = await clients[0]
    .from("fittt_push_subscriptions")
    .insert({
      user_id: accounts[0].id,
      endpoint,
      ...keys,
      timezone,
      lunch: true,
      evening: true,
    })
    .select("id")
    .single();
  assert.equal(inserted.error, null);
  const id = inserted.data.id;
  fs.writeFileSync(".env.pushtest.json", JSON.stringify({ id, timezone }));
  const read = await clients[1]
    .from("fittt_push_subscriptions")
    .select("id")
    .eq("id", id);
  assert.deepEqual(read.data, []);
  const edit = await clients[1]
    .from("fittt_push_subscriptions")
    .update({ lunch: false })
    .eq("id", id)
    .select("id");
  assert.deepEqual(edit.data, []);
  const privateKeys = await clients[0].rpc("fittt_push_keys");
  assert.ok(privateKeys.error);
  const jobs = await clients[0].from("fittt_push_jobs").select("id");
  assert.ok(jobs.error);
  const privateAddress = await clients[0]
    .from("fittt_push_subscriptions")
    .insert({
      user_id: accounts[0].id,
      endpoint: "https://127.0.0.1/push",
      ...keys,
      timezone,
      lunch: true,
      evening: true,
    });
  assert.ok(privateAddress.error);
  console.log(
    "PASS: own subscription creation, cross-user read/update denial, Vault/job access denial, private endpoint rejection, payload encryption. Synthetic subscription left for scheduled suppression test.",
  );
} finally {
  await Promise.all(clients.map((c) => c.auth.signOut({ scope: "local" })));
}
