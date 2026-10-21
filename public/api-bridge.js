/*
 * Keeps the existing screen logic intact while replacing Apps Script calls with
 * a small authenticated Supabase Edge Function API.
 */
(function () {
  "use strict";

  const TOKEN_KEY = "cg_session_token_v1";
  const QUEUE_KEY = "cg_fila_v1";
  const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("caderneta-offline-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  function idbGet(key) {
    return dbPromise.then(db => new Promise((resolve, reject) => {
      const req = db.transaction("kv", "readonly").objectStore("kv").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function idbSet(key, value) {
    return dbPromise.then(db => new Promise((resolve, reject) => {
      const req = db.transaction("kv", "readwrite").objectStore("kv").put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  // Mirror the pending queue to IndexedDB. It can restore the queue if the
  // browser's small synchronous storage is cleared or unavailable.
  const storageSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    storageSet.call(this, key, value);
    if (this === window.localStorage && key === QUEUE_KEY) idbSet(QUEUE_KEY, String(value)).catch(console.warn);
  };
  window.__offlineQueueReady = idbGet(QUEUE_KEY).then(saved => {
    if (saved && (!localStorage.getItem(QUEUE_KEY) || localStorage.getItem(QUEUE_KEY) === "[]")) {
      storageSet.call(localStorage, QUEUE_KEY, saved);
    }
  }).catch(() => {});

  function configured() {
    const c = window.APP_CONFIG || {};
    if (!c.supabaseUrl || c.supabaseUrl.indexOf("SEU-PROJETO") !== -1 ||
        !c.supabaseAnonKey || c.supabaseAnonKey.indexOf("COLE_A_CHAVE") !== -1) {
      throw new Error("O aplicativo ainda precisa ser conectado ao projeto Supabase. Veja o arquivo README.");
    }
    return c;
  }

  async function call(action, args) {
    const c = configured();
    const headers = { "Content-Type": "application/json", "apikey": c.supabaseAnonKey };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && action !== "realizarLogin") headers.Authorization = "Bearer " + token;
    const response = await fetch(c.supabaseUrl.replace(/\/$/, "") + "/functions/v1/api", {
      method: "POST", headers, body: JSON.stringify({ action, args })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || result.message || "Não foi possível concluir a operação.");
    if (action === "realizarLogin" && result && result.sucesso && result.token) {
      localStorage.setItem(TOKEN_KEY, result.token);
    }
    return result;
  }

  const runner = new Proxy({}, {
    get(_target, property) {
      if (property === "withSuccessHandler") return fn => { success = fn; return runner; };
      if (property === "withFailureHandler") return fn => { failure = fn; return runner; };
      if (typeof property !== "string") return undefined;
      return (...args) => {
        const onSuccess = success;
        const onFailure = failure;
        success = null;
        failure = null;
        call(property, args)
          .then(value => { if (typeof onSuccess === "function") onSuccess(value); })
          .catch(error => {
            if (typeof onFailure === "function") onFailure(error);
            else console.error("Falha na operação " + property + ":", error);
          });
      };
    }
  });
  let success = null;
  let failure = null;
  window.AppAPI = { run: runner, call };

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.warn));
  }
})();
