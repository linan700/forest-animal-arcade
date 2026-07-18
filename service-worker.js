"use strict";

const CACHE_NAME = "forest-animal-arcade-iphone-offline-20260717i";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=20260717i",
  "./game.js?v=20260717i",
  "./three-scene.bundle.js?v=20260717i",
  "./manifest.webmanifest?v=20260717i",
  "./assets/forest-bg.webp",
  "./assets/lion.webp",
  "./assets/panda.webp",
  "./assets/monkey.webp",
  "./assets/rabbit.webp",
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
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
