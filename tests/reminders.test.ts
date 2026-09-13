import { expect, test } from "vitest";
import {
  reminderDue,
  pushEndpointAllowed,
  reminderPayload,
} from "../lib/reminders";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("noon and evening follow local time through Sydney daylight saving", () => {
  expect(
    reminderDue(
      new Date("2026-09-13T02:00:00Z"),
      "Australia/Sydney",
      true,
      true,
    ),
  ).toEqual({ day: "2026-09-13", slot: "lunch" });
  expect(
    reminderDue(
      new Date("2026-10-05T01:05:00Z"),
      "Australia/Sydney",
      true,
      true,
    )?.slot,
  ).toBe("lunch");
  expect(
    reminderDue(
      new Date("2026-10-05T08:00:00Z"),
      "Australia/Sydney",
      true,
      true,
    )?.slot,
  ).toBe("evening");
  expect(
    reminderDue(
      new Date("2026-10-05T01:15:00Z"),
      "Australia/Sydney",
      true,
      true,
    ),
  ).toBeNull();
  expect(
    reminderDue(
      new Date("2026-10-05T01:00:00Z"),
      "Australia/Sydney",
      false,
      true,
    ),
  ).toBeNull();
  expect(
    reminderDue(
      new Date("2026-10-05T08:00:00Z"),
      "Australia/Sydney",
      true,
      false,
    ),
  ).toBeNull();
});
test("only recognized HTTPS push services can receive server requests", () => {
  for (const url of [
    "http://fcm.googleapis.com/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://fcm.googleapis.com.evil.test/a",
    "https://user@fcm.googleapis.com/a",
    "https://fcm.googleapis.com:444/a",
  ])
    expect(pushEndpointAllowed(url)).toBe(false);
  for (const url of [
    "https://fcm.googleapis.com/a",
    "https://web.push.apple.com/a",
    "https://updates.push.services.mozilla.com/a",
  ])
    expect(pushEndpointAllowed(url)).toBe(true);
});
test("service worker shows a generic reminder and opens Today without trusting payload URLs", async () => {
  const handlers: Record<string, (e: unknown) => void> = {};
  const shown: unknown[] = [];
  const opened: string[] = [];
  const pending: Promise<unknown>[] = [];
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        handlers[name] = fn;
      },
      registration: {
        showNotification: async (...v: unknown[]) => {
          shown.push(v);
        },
      },
      clients: {
        openWindow: async (url: string) => {
          opened.push(url);
        },
      },
    },
  });
  handlers.push({
    data: {
      json: () => ({
        ...reminderPayload("lunch", "2026-09-13"),
        url: "https://evil.test",
      }),
    },
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  });
  handlers.notificationclick({
    notification: { close: () => {}, data: { url: "https://evil.test" } },
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  });
  await Promise.all(pending);
  expect(shown[0]).toEqual([
    "FITTT",
    expect.objectContaining({
      tag: "fittt-2026-09-13-lunch",
      data: { url: "/" },
    }),
  ]);
  expect(opened).toEqual(["/"]);
});
