// Простое скрытие текста от случайного взгляда (авторские данные, сохранения).
// ЭТО НЕ ШИФРОВАНИЕ: тот, кто целенаправленно полезет в код, данные прочитает.
// Задача — чтобы спойлеры не бросались в глаза в файлах игры и в файле сохранения.
G.define("codec", function () {
  const MAGIC = "NW1:";
  function keystream(n) {
    const out = new Uint8Array(n);
    let x = 0x6e6f7277; // «norw»
    for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; out[i] = x & 255; }
    return out;
  }
  function toB64(bytes) {
    let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(b64); const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function encode(text) {
    const b = new TextEncoder().encode(text), k = keystream(b.length);
    for (let i = 0; i < b.length; i++) b[i] ^= k[i];
    return MAGIC + toB64(b);
  }
  function decode(text) {
    const t = String(text).replace(/^﻿/, "").trim();
    if (!t.startsWith(MAGIC)) return t; // обычный JSON (старые сохранения, открытые данные)
    const b = fromB64(t.slice(MAGIC.length)), k = keystream(b.length);
    for (let i = 0; i < b.length; i++) b[i] ^= k[i];
    return new TextDecoder().decode(b);
  }
  function isEncoded(text) { return String(text).trim().startsWith(MAGIC); }
  return { encode, decode, isEncoded };
});
