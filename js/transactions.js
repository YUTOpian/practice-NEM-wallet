// transactions.js
import { appState, NetworkType } from "./config.js";
import { addCallback, getBlockTimestamp } from "./ws.js";

const txMap = {};

/* ============================================================
   timestamp → 人間時間
============================================================ */
function formatTimestamp(symbolTimestamp) {
  if (!symbolTimestamp || !appState.epochAdjustment) return "";

  const unixMs = appState.epochAdjustment * 1000 + Number(symbolTimestamp);
  return new Date(unixMs).toLocaleString("ja-JP", { hour12: false });
}

/* ============================================================
   Hex → UTF-8
============================================================ */
function decodeMessage(payload) {
  if (!payload) return "(no message)";

  let hex = payload;
  if (hex.startsWith("00")) hex = hex.slice(2);

  const arr = hex.match(/.{1,2}/g);
  if (!arr) return "(decode error)";

  try {
    const bytes = new Uint8Array(arr.map(h => parseInt(h, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return "(decode error)";
  }
}

/* ============================================================
   Address変換
============================================================ */
function formatAddress(address) {
  if (!address) return "---";
  try {
    if (typeof address === "string") return address;
    return address.plain();
  } catch {
    return String(address);
  }
}

/* ============================================================
   モザイク取得
============================================================ */
function extractAmount(tx) {
  if (!tx.mosaics || tx.mosaics.length === 0) return null;

  const signer = (tx.signerPublicKey || "").toUpperCase();
  const myPub = (appState.currentPubKey || "").toUpperCase();
  const direction = signer === myPub ? "send" : "receive";

  const mosaics = tx.mosaics.map(mosaic => {
    const info = appState.mosaicInfo?.[mosaic.id];
    const divisibility = info?.divisibility ?? 0;
    const name = info?.name ?? mosaic.id;

    return {
      id: mosaic.id,
      name,
      amount: Number(mosaic.amount) / (10 ** divisibility)
    };
  });

  return { mosaics, direction };
}

/* ============================================================
   Explorer URL
============================================================ */
function getExplorerUrl(hash) {
  return appState.networkType === NetworkType.TESTNET
    ? `https://testnet.symbol.fyi/transactions/${hash}`
    : `https://symbol.fyi/transactions/${hash}`;
}

/* ============================================================
   アクティビティカード
============================================================ */
export function createTxCard(txInfo) {
  const { hash, msg, state, timestamp, mosaics, direction, sender, recipient } = txInfo;
  const explorer = getExplorerUrl(hash);
  const label = direction === "receive" ? "受信" : "送信";

  let mosaicHtml = "";
  if (mosaics && mosaics.length > 0) {
    mosaicHtml = mosaics.map(mosaic => `
      <div class="tx-mosaic">
        <div>トークン: ${mosaic.name}</div>
        <div>数量: ${mosaic.amount}</div>
      </div>
    `).join("");
  }

  return `
    <div class="tx-item ${state === "unconfirmed" ? "unconfirmed" : "confirmed"}" id="tx-${hash}" onclick="window.open('${explorer}','_blank')">
      <div class="tx-body">
        <div class="tx-title">${label}</div>
        <div class="tx-status">${state.toUpperCase()}</div>
        <div class="tx-address">送金元:<br>${sender ?? "---"}</div>
        <div class="tx-address">送金先:<br>${recipient ?? "---"}</div>
        ${mosaicHtml}
        <div class="tx-message">メッセージ:<br>${msg}</div>
        ${state === "confirmed" && timestamp ? `
          <div class="tx-time">🕒 ${formatTimestamp(timestamp)}</div>
        ` : ""}
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

/* ============================================================
   直近10件
============================================================ */
export async function loadRecentTx() {
  const el = document.getElementById("tx-list");
  el.textContent = "読み込み中…";

  const address = appState.currentAddress.toString();
  const url = `${appState.NODE}/transactions/confirmed?address=${address}&order=desc&limit=10`;

  try {
    const res = await fetch(url);
    const json = await res.json();

    el.innerHTML = json.data.map(item => {
      const tx = item.transaction;
      const meta = item.meta;
      const amountInfo = extractAmount(tx);

      const txInfo = {
        hash: meta.hash,
        sender: amountInfo?.direction === "send" ? address : formatAddress(tx.signerPublicKey),
        recipient: formatAddress(tx.recipientAddress),
        msg: decodeMessage(tx.message),
        state: "confirmed",
        timestamp: meta.timestamp,
        mosaics: amountInfo?.mosaics ?? [],
        direction: amountInfo?.direction ?? null
      };

      txMap[meta.hash] = txInfo;
      return createTxCard(txInfo);
    }).join("");

  } catch (e) {
    console.error(e);
    el.textContent = "読み込みエラー";
  }
}

/* ============================================================
   Live Transaction
============================================================ */
export function initLiveTx(address) {
  // 未承認トランザクションの検知
  addCallback(`unconfirmedAdded/${address}`, payload => {
    const tx = payload.data;
    const hash = tx.meta.hash;
    if (txMap[hash]) return;

    const amountInfo = extractAmount(tx.transaction);
    const txInfo = {
      hash,
      sender: appState.currentAddress.toString(),
      recipient: formatAddress(tx.transaction.recipientAddress),
      msg: decodeMessage(tx.transaction.message),
      state: "unconfirmed",
      timestamp: null,
      mosaics: amountInfo?.mosaics ?? [],
      direction: amountInfo?.direction ?? null
    };

    txMap[hash] = txInfo;
    appendTx(txInfo);
  });

  // 承認トランザクションの検知
  addCallback(`confirmedAdded/${address}`, async payload => {
    const tx = payload.data;
    const hash = tx.meta.hash;

    const blockTs = await getBlockTimestamp(tx.meta.height);
    const amountInfo = extractAmount(tx.transaction);

    const txInfo = {
      hash,
      sender: appState.currentAddress.toString(),
      recipient: formatAddress(tx.transaction.recipientAddress),
      msg: decodeMessage(tx.transaction.message),
      state: "confirmed",
      timestamp: blockTs,
      mosaics: amountInfo?.mosaics ?? [],
      direction: amountInfo?.direction ?? null
    };

    txMap[hash] = txInfo;
    appendTx(txInfo);
  });
}
