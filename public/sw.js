// Health data and authenticated pages are never cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification("FITTT", {
      body:
        typeof payload.body === "string"
          ? payload.body
          : "A quick check-in when you have a moment.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "fittt-reminder",
      data: { url: "/" },
      renotify: false,
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<html><meta name="viewport" content="width=device-width"><body style="font:20px system-ui;padding:32px;background:#f6f5ef;color:#163e35"><h1>FITTT</h1><p>You’re offline. Reconnect to securely load and save your check-in.</p><button onclick="location.reload()">Try again</button></body></html>',
            { headers: { "Content-Type": "text/html" } },
          ),
      ),
    );
});
