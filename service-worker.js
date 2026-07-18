"use strict";

const CACHE_NAME = "forest-animal-arcade-iphone-offline-20260718m";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=20260718m",
  "./game.js?v=20260718m",
  "./three-scene.bundle.js?v=20260718m",
  "./manifest.webmanifest?v=20260718m",
  "./assets/forest-bg.webp",
  "./assets/lion.webp",
  "./assets/panda.webp",
  "./assets/monkey.webp",
  "./assets/rabbit.webp",
  "./assets/tap.wav",
  "./assets/tick.wav",
  "./assets/error.wav",
  "./assets/win.wav",
  "./assets/jackpot.wav",
  "./assets/app-icon-512.png",
  "./assets/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
        }
        return response;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => Response.error());
    })
  );
});
