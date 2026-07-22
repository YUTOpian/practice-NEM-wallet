// ws.js
// NIS1にはSymbolのような単純なWebSocket購読(トピック文字列をsubscribeするだけ)は無く、
// SockJS+STOMPベースの別プロトコルになる。実装コストと安定性を考慮し、
// このアプリでは「数秒おきにREST APIを再取得するポーリング」で
// 同等のリアルタイム性(見た目上)を実現する。
//
// 呼び出し側(auth.js, settings.js, transactions.js等)からの見え方を変えないよう、
// 関数名は元のWebSocket版と同じ(initWebSocket / closeWebSocket / addCallback /
// getBlockTimestamp)にしてある。

import { appState } from "./config.js";
import { playSoundOnce } from "./utils.js";

const POLL_INTERVAL_MS = 8000;

let pollTimer = null;
let callbacks = {};
let knownUnconfirmedHashes = new Set();
let knownConfirmedHashes = new Set();
let soundHooksRegistered = false;

/* ============================================================
   ポーリング開始
============================================================ */
export function initWebSocket(address) {
  closeWebSocket();

  knownUnconfirmedHashes = new Set();
  knownConfirmedHashes = new Set();
  registerSoundCallbacks(address);

  const tick = async () => {
    if (!appState.NODE || !appState.currentAddress) return;

    try {
      // 未承認トランザクション
      const unconfirmedRes = await fetch(
        `${appState.NODE}/account/unconfirmedTransactions?address=${address}`
      );
      const unconfirmedJson = await unconfirmedRes.json();
      const unconfirmedItems = unconfirmedJson?.data ?? [];

      for (const item of unconfirmedItems) {
        const hash = item.meta?.hash?.data ?? item.meta?.hash;
        if (!hash || knownUnconfirmedHashes.has(hash)) continue;
        knownUnconfirmedHashes.add(hash);

        const topic = `unconfirmedAdded/${address}`;
        (callbacks[topic] || []).forEach((cb) => cb({ data: item }));
      }

      // 承認済みトランザクション(直近分)
      const confirmedRes = await fetch(
        `${appState.NODE}/account/transfers/all?address=${address}&pageSize=10`
      );
      const confirmedJson = await confirmedRes.json();
      const confirmedItems = confirmedJson?.data ?? [];

      for (const item of confirmedItems) {
        const hash = item.meta?.hash?.data ?? item.meta?.hash;
        if (!hash || knownConfirmedHashes.has(hash)) continue;
        knownConfirmedHashes.add(hash);
        knownUnconfirmedHashes.delete(hash);

        const topic = `confirmedAdded/${address}`;
        (callbacks[topic] || []).forEach((cb) => cb({ data: item }));
      }
    } catch (e) {
      console.warn("polling error:", e);
    }
  };

  // 初回は「今ある分」を既知として扱うため、
  // コールバック発火なしで1回だけ状態を埋める
  (async () => {
    try {
      const confirmedRes = await fetch(
        `${appState.NODE}/account/transfers/all?address=${address}&pageSize=10`
      );
      const confirmedJson = await confirmedRes.json();
      for (const item of confirmedJson?.data ?? []) {
        const hash = item.meta?.hash?.data ?? item.meta?.hash;
        if (hash) knownConfirmedHashes.add(hash);
      }
    } catch (e) {
      console.warn("initial polling seed error:", e);
    }

    pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  })();
}

/* ============================================================
   ポーリング停止（ノード切替時などに使用）
============================================================ */
export function closeWebSocket() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ============================================================
   callback 登録
============================================================ */
export function addCallback(topic, cb) {
  if (!callbacks[topic]) callbacks[topic] = [];
  callbacks[topic].push(cb);
}

/* ============================================================
   block height → timestamp (NEMネットワーク時刻。秒単位)
   NIS1: GET /block/at/public { height } (POST)
============================================================ */
export async function getBlockTimestamp(height) {
  try {
    const res = await fetch(new URL("/block/at/public", appState.NODE), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ height: Number(height) }),
    });
    const json = await res.json();
    return json?.timeStamp ?? null;
  } catch {
    return null;
  }
}

/* ============================================================
   未承認 / 承認の音を１回だけ登録
============================================================ */
function registerSoundCallbacks(address) {
  if (soundHooksRegistered) return;

  addCallback(`unconfirmedAdded/${address}`, () => {
    playSoundOnce("./sounds/ding.ogg");
  });

  addCallback(`confirmedAdded/${address}`, () => {
    playSoundOnce("./sounds/ding2.ogg");
  });

  soundHooksRegistered = true;
}
