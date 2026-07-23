// offlineTx.js
// オフライントランザクション機能
//
// 目的: 秘密鍵をオンライン環境から分離し、安全にトランザクションへ署名できる仕組み。
//
//   【オフライン環境】(高度機能 → オフライントランザクション。ログイン必須)
//     ・送金内容を作成
//     ・秘密鍵で署名(ネットワーク通信は一切行わない)
//     ・KASANE_OFFLINE_TX 形式のJSONファイルを書き出す
//
//   【オンライン環境】(ようこそ画面/ログイン画面。ログイン不要)
//     ・書き出されたJSONファイルを読み込む
//     ・内容を確認する
//     ・ノードへアナウンスのみ実行する(秘密鍵は一切扱わない)
//
// JSON形式:
// {
//   "type": "KASANE_OFFLINE_TX",
//   "version": 1,
//   "chain": "NEM",
//   "network": "MAIN_NET" | "TEST_NET",
//   "transactionType": "TRANSFER",
//   "payload": "...",        // 署名前のエンティティ(tx.serialize())のhex
//   "signature": "...",      // 署名のhex
//   "signerPublicKey": "...",
//   "hash": "..."
// }

import { appState, NetworkType } from "./config.js";
import { selectNode } from "./nodeSelector.js";
import { normalizeAddress } from "./utils.js";

export const OFFLINE_TX_TYPE = "KASANE_OFFLINE_TX";
export const OFFLINE_TX_VERSION = 1;

function networkTypeToLabel(networkType) {
  return networkType === NetworkType.TESTNET ? "TEST_NET" : "MAIN_NET";
}

/* ============================================================
   オフライン署名
   ログイン中のアカウント(この端末上の秘密鍵)でその場で署名し、
   KASANE_OFFLINE_TX形式のオブジェクトを作る。
   ※ この関数はネットワーク通信を一切行わない(ローカル署名のみ)。
============================================================ */
export async function createSignedOfflineTx({ recipientAddress, amountXem, message }) {
  if (!appState.facade || !appState.currentPubKey || !appState.localKeyPair) {
    throw new Error("アカウントが未接続です(この端末でログインしている必要があります)");
  }
  if (!recipientAddress) {
    throw new Error("宛先アドレスを入力してください");
  }

  const amount = Number(amountXem);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("金額が不正です");
  }

  const { descriptors, models } = appState.sdkNem;

  const messageDescriptor = new descriptors.MessageDescriptor(
    models.MessageType.PLAIN,
    message && message.trim() !== "" ? message : ""
  );

  const descriptor = new descriptors.TransferTransactionV1Descriptor(
    new appState.sdkNem.Address(normalizeAddress(recipientAddress)),
    new models.Amount(BigInt(Math.floor(amount * 1_000_000))),
    messageDescriptor
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  // 署名のみ(アナウンスはしない)
  const signature = appState.facade.signTransaction(appState.localKeyPair, tx);
  const payloadHex = appState.sdkCore.utils.uint8ToHex(tx.serialize());
  const signatureBytes = signature.bytes ?? signature;
  const signatureHex = appState.sdkCore.utils.uint8ToHex(signatureBytes);
  const hash = appState.facade.hashTransaction(tx).toString();

  return {
    type: OFFLINE_TX_TYPE,
    version: OFFLINE_TX_VERSION,
    chain: "NEM",
    network: networkTypeToLabel(appState.networkType),
    transactionType: "TRANSFER",
    payload: payloadHex,
    signature: signatureHex,
    signerPublicKey: appState.currentPubKey,
    hash,
  };
}

/* ============================================================
   JSONファイルとしてダウンロードさせる
============================================================ */
export function downloadOfflineTxJson(offlineTx) {
  const blob = new Blob([JSON.stringify(offlineTx, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `offline-tx-${(offlineTx.hash || "unsigned").slice(0, 16)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
   高度機能ページ側の読み込み欄用ガード。
   既に署名済み(signatureが入っている)のKASANE_OFFLINE_TXを
   誤ってここに読み込ませようとした場合は拒否する。
============================================================ */
export function guardAgainstSignedOfflineTx(json) {
  if (json && json.type === OFFLINE_TX_TYPE && json.signature) {
    throw new Error("署名済みなので読み込めません");
  }
}

/* ============================================================
   オンライン側: ファイルの内容をJSONとしてパース・検証する
============================================================ */
export function parseOfflineTxJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("JSONの形式が正しくありません");
  }

  if (json.type !== OFFLINE_TX_TYPE) {
    throw new Error(`対応していないファイル形式です(type: ${json.type ?? "不明"})`);
  }
  if (!json.payload || !json.signature) {
    throw new Error("署名データが不足しています(payload / signature が必要です)");
  }
  if (json.network !== "MAIN_NET" && json.network !== "TEST_NET") {
    throw new Error("networkの値が不正です(MAIN_NET または TEST_NET である必要があります)");
  }

  return json;
}

/* ============================================================
   オンライン側: ブロードキャスト先ノードを自動選択する
   (読み込んだJSONのnetworkに応じてHTTPS対応ノードを自動選定)
============================================================ */
export async function selectNodeForOfflineTx(json) {
  const isTestnet = json.network === "TEST_NET";
  return await selectNode(isTestnet);
}

/* ============================================================
   オンライン側: ノードへアナウンスのみ実行する。
   ※ 秘密鍵・署名処理は一切行わない(読み込んだ署名データをそのまま送るだけ)。
============================================================ */
export async function broadcastOfflineTx(json, nodeUrl) {
  const body = JSON.stringify({ data: json.payload, signature: json.signature });

  const res = await fetch(new URL("/transaction/announce", nodeUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const result = await res.json();
  if (!res.ok || (result.code != null && result.code !== 1)) {
    throw new Error(result.message ?? "アナウンスに失敗しました");
  }

  return json.hash;
}
