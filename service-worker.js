/* ============================================================
   Service Worker - 오프라인 캐싱
   - 정적 파일(HTML/CSS/JS/manifest/아이콘)을 캐시에 저장
   - 오프라인이거나 느린 네트워크에서도 앱 껍데기가 바로 뜸
   - Supabase API 호출은 캐싱하지 않음 (항상 최신 데이터)
   ============================================================ */

// 캐시 버전 — 캐시할 파일이 바뀌면 v2, v3... 으로 올리면 옛 캐시가 정리됨
// ※ index.html·CSS·JS 등을 수정·배포할 때마다 이 숫자를 반드시 올릴 것!
const CACHE_NAME = 'mycuration-v3';

// 미리 캐시할 정적 파일 목록 (같은 출처의 앱 파일만)
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './supabase-client.js',
  './site-config.js',
  './manifest.json',
  './icons/icon.svg'
];

/* --- install: 정적 파일을 캐시에 등록 --- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();   // 새 SW를 즉시 활성화
});

/* --- activate: 옛 버전 캐시 정리 --- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();   // 열려 있는 페이지를 즉시 제어
});

/* --- fetch: 요청 가로채기 ---
   - 다른 출처(Supabase API, CDN 등)는 건드리지 않고 네트워크로 직행
     → 실시간 데이터가 캐시에 갇히지 않음
   - 같은 출처의 GET 요청만 '캐시 우선'으로 응답 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 다른 출처(Supabase 등)는 캐싱하지 않음 — 기본 네트워크 처리에 맡김
  if (url.origin !== self.location.origin) return;

  // GET 외(POST 등)는 캐싱하지 않음
  if (event.request.method !== 'GET') return;

  // 캐시에 있으면 캐시로, 없으면 네트워크로
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
