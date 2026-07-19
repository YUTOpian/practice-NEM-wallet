// signer.js
// SSS Extension / ニーモニック(ローカル署名) の両方式に対応する
// 署名の共通インターフェース。
//
// transfer.js / harvest.js はこのモジュールの requestSign() だけを使い、
// 「今どちらの方式で接続しているか」を意識しなくて済むようにする。

import { appState } from "./config.js";

// ニーモニックモード時のみ使用するKeyPair（メモリ上のみ・保存しない）
let localKeyPair = null;

export function setLocalKeyPair(keyPair) {
  localKeyPair = keyPair;
}

export function clearLocalKeyPair() {
  localKeyPair = null;
}

export function hasLocalKeyPair() {
  return !!localKeyPair;
}

/**
 * 未署名トランザクションのシリアライズ済みhexを受け取り、
 * 署名済みhexを { payload } の形で返す。
 * SSS / ニーモニックのどちらのモードでも同じインターフェース。
 */
export async function requestSign(payloadHex) {
  if (appState.connectionMode === "mnemonic") {
    if (!localKeyPair) {
      throw new Error("ニーモニックがロードされていません。再ログインしてください。");
    }

    const bytes = appState.sdkCore.utils.hexToUint8(payloadHex);
    const tx = appState.facade.transactionFactory.static.deserialize(bytes);

    const signature = appState.facade.signTransaction(localKeyPair, tx);
    appState.facade.transactionFactory.static.attachSignature(tx, signature);

    return { payload: appState.sdkCore.utils.uint8ToHex(tx.serialize()) };
  }

  // ===== SSS Extension モード =====
  if (!window.SSS) {
    throw new Error("SSS Extensionが見つかりません");
  }

  window.SSS.setTransactionByPayload(payloadHex);
  const signed = await window.SSS.requestSign();

  if (!signed?.payload) {
    throw new Error("SSS署名に失敗しました");
  }

  return signed;
}
