// transactions.js
// NIS1 REST API 版のトランザクション一覧・履歴表示

import { appState, NetworkType, NEM_EPOCH_UNIX_SECONDS, NemTransactionType } from "./config.js";
import { addCallback, getBlockTimestamp } from "./ws.js";
import { hexToBytes } from "./utils.js";

const txMap = {};

/* ============================================================
   NEMネットワーク時刻 → 人間時間
============================================================ */
function formatTimestamp(nemTimestampSeconds) {
  if (nemTimestampSeconds == null) return "";
  const unixMs = (NEM_EPOCH_UNIX_SECONDS + Number(nemTimestampSeconds)) * 1000;
  return new Date(unixMs).toLocaleString("ja-JP", { hour12: false });
}

/* ============================================================
   メッセージ Decode
   NEM: { type: 1(平文) | 2(暗号化), payload: hex }
============================================================ */
function decodeMessage(message) {
  if (!message || !message.payload) return "(no message)";

  try {
    if (message.type === 2) {
      return "🔐 暗号化メッセージ";
    }
    const bytes = hexToBytes(message.payload);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("message decode error", e);
    return "(decode error)";
  }
}

/* ============================================================
   Address フォーマット(NIS1 REST APIのアドレスは基本そのままbase32)
============================================================ */
function formatAddress(address) {
  return address || "---";
}

/**
 * 送信者の公開鍵からアドレス(base32)を導出する
 */
function publicKeyToAddress(pubKeyHex) {
  if (!pubKeyHex) return "---";
  try {
    const pub = new appState.sdkCore.PublicKey(pubKeyHex);
    return appState.facade.network.publicKeyToAddress(pub).toString();
  } catch (e) {
    console.warn("publicKey→address変換失敗", e);
    return pubKeyHex;
  }
}

/* ============================================================
   マルチシグでラップされたTxは、実際の内容(otherTrans)を見る
============================================================ */
function unwrapTransaction(tx) {
  if (tx?.type === NemTransactionType.MULTISIG && tx.otherTrans) {
    return tx.otherTrans;
  }
  return tx;
}

/* ============================================================
   Explorer (NEMは公式エクスプローラが複数あるため一例としてnemtool/explorerを使用)
============================================================ */
function getExplorerUrl(hash) {
  return appState.networkType === NetworkType.TESTNET
    ? `https://testnet-explorer.nemtool.com/#/s_tx?hash=${hash}`
    : `https://explorer.nemtool.com/#/s_tx?hash=${hash}`;
}

/* ============================================================
   Mosaic/金額抽出
============================================================ */
function extractAmount(rawTx) {
  const tx = unwrapTransaction(rawTx);
  const signer = (tx.signer || "").toUpperCase();
  const myPub = (appState.currentPubKey || "").toUpperCase();
  const direction = signer === myPub ? "send" : "receive";

  // NEMの単純送金は amount(microXEM)、モザイク付き送金は mosaics[]
  const mosaics = [];

  if (tx.mosaics && tx.mosaics.length > 0) {
    for (const m of tx.mosaics) {
      const id = m.mosaicId;
      const key = `${id.namespaceId}:${id.name}`;
      const info = appState.mosaicInfo?.[key];
      const divisibility = info?.divisibility ?? 0;
      const name = info?.mosaicName ?? key;
      mosaics.push({ id: key, name, amount: Number(m.quantity) / (10 ** divisibility) });
    }
  } else if (tx.amount != null) {
    mosaics.push({ id: "nem:xem", name: "XEM", amount: Number(tx.amount) / 1_000_000 });
  }

  return { mosaics, direction, tx };
}

/* ============================================================
   Txカード
============================================================ */
export function createTxCard(txInfo) {
  const { hash, msg, state, timestamp, mosaics, direction, sender, recipient } = txInfo;
  const explorer = getExplorerUrl(hash);
  const isSend = direction === "send";
  const label = isSend ? "送信" : "受信";
  const labelClass = isSend ? "tx-label-send" : "tx-label-receive";
  const amountClass = isSend ? "tx-amount-send" : "tx-amount-receive";
  const sign = isSend ? "-" : "+";

  let mosaicHtml = "";
  if (mosaics && mosaics.length) {
    mosaicHtml = mosaics.map(mosaic => `
      <div class="tx-mosaic">
        <span class="tx-mosaic-name">${mosaic.name}</span>
        <span class="tx-mosaic-amount ${amountClass}">${sign}${mosaic.amount}</span>
      </div>
    `).join("");
  }

  return `
    <div class="tx-item ${state === "unconfirmed" ? "unconfirmed" : "confirmed"}" id="tx-${hash}" onclick="window.open('${explorer}','_blank')">
      <div class="tx-body">
        <div class="tx-title ${labelClass}">${label}</div>
        <div class="tx-status">${state.toUpperCase()}</div>
        <div class="tx-address"><span class="tx-address-label">送金元</span><span class="tx-address-value">${sender ?? "---"}</span></div>
        <div class="tx-address"><span class="tx-address-label">送金先</span><span class="tx-address-value">${recipient ?? "---"}</span></div>
        ${mosaicHtml}
        <div class="tx-message"><span class="tx-message-label">メッセージ</span><span class="tx-message-value">${msg}</span></div>
        ${state === "confirmed" && timestamp != null ? `<div class="tx-time">🕒 ${formatTimestamp(timestamp)}</div>` : ""}
      </div>
    </div>
  `;
}

/* ============================================================
   DOM追加
============================================================ */
function appendTx(txInfo) {
  const list = document.getElementById("tx-list");
  list.insertAdjacentHTML("afterbegin", createTxCard(txInfo));
}

function buildTxInfo(item, address, state) {
  const meta = item.meta;
  const hash = meta?.hash?.data ?? meta?.hash;
  const rawTx = item.transaction;
  const amountInfo = extractAmount(rawTx);
  const tx = amountInfo.tx;

  return {
    hash,
    sender: amountInfo.direction === "send" ? address : publicKeyToAddress(tx.signer),
    recipient: formatAddress(tx.recipient),
    msg: decodeMessage(tx.message),
    state,
    timestamp: state === "confirmed" ? rawTx.timeStamp : null,
    mosaics: amountInfo.mosaics,
    direction: amountInfo.direction,
  };
}

/* ============================================================
   直近10件取得 (NIS1 /account/transfers/all)
============================================================ */
export async function loadRecentTx() {
  const el = document.getElementById("tx-list");
  el.textContent = "読み込み中…";

  const address = appState.currentAddress.toString();
  const url = `${appState.NODE}/account/transfers/all?address=${encodeURIComponent(address)}&pageSize=10`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    const items = json.data ?? [];

    el.innerHTML = items
      .map((item) => {
        const txInfo = buildTxInfo(item, address, "confirmed");
        txMap[txInfo.hash] = txInfo;
        return createTxCard(txInfo);
      })
      .join("");
  } catch (e) {
    console.error(e);
    el.textContent = "読み込みエラー";
  }
}

/* ============================================================
   ポーリングによる擬似リアルタイム更新 (ws.js参照)
============================================================ */
export function initLiveTx(address) {
  addCallback(`unconfirmedAdded/${address}`, (payload) => {
    const item = payload.data;
    const hash = item.meta?.hash?.data ?? item.meta?.hash;
    if (!hash || txMap[hash]) return;

    const txInfo = buildTxInfo(item, address, "unconfirmed");
    txMap[hash] = txInfo;
    appendTx(txInfo);
  });

  addCallback(`confirmedAdded/${address}`, (payload) => {
    const item = payload.data;
    const hash = item.meta?.hash?.data ?? item.meta?.hash;
    if (!hash) return;

    const txInfo = buildTxInfo(item, address, "confirmed");
    txMap[hash] = txInfo;

    // 既に(unconfirmedとして)表示済みのDOM要素があれば置き換える、無ければ先頭に追加
    const existing = document.getElementById(`tx-${hash}`);
    if (existing) {
      existing.outerHTML = createTxCard(txInfo);
    } else {
      appendTx(txInfo);
    }
  });
}

export { getBlockTimestamp };
