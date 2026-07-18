// sss.js
// SSS Extension との接続と、それを起点にした Node / SDK の初期化

import { appState, NetworkType } from "./config.js";
import { selectNode } from "./nodeSelector.js";
import { initSdk } from "./sdk.js";
import { setStatus, setText } from "./ui.js";
import { refreshAccount } from "./account.js";
import { loadRecentTx } from "./transactions.js";

/* ------------------------------------------------------
  ネットワーク名表示
------------------------------------------------------ */
function networkLabel(nt) {
  return nt === NetworkType.TESTNET ? "Testnet" : "Mainnet";
}

/* ------------------------------------------------------
  多重実行防止 + ネットワーク確定フラグ
------------------------------------------------------ */
let isConnecting = false;
//let isConnectedOnce = false;        // ← 1回だけ実行
let lockedNetworkType = null;       // ← 途中で Testnet に変わらないようロック

/* ------------------------------------------------------
  内部接続処理（自動 / 手動どちらも利用）
------------------------------------------------------ */
async function internalConnect(isAuto) {

  // --- 完全に1回だけ実行 ---
  if (isConnecting) return;
  isConnecting = true;

  try {
    // SSS 未インストール
    if (!window.SSS) {
      if (!isAuto) setStatus("sss-status", "SSS Extension が見つかりません。", "error");
      return;
    }

    const pubKey = window.SSS.activePublicKey;
    const detectedNetworkType = Number(window.SSS.activeNetworkType);

    console.log("SSS pubKey:", pubKey);
    console.log("Network:", detectedNetworkType);

    if (!pubKey || ![NetworkType.MAINNET, NetworkType.TESTNET].includes(detectedNetworkType)) {
      if (!isAuto) {
        setStatus("sss-status", "SSS のポップアップでアカウントを選択してください。", "error");
      }
      return;
    }

    // --- ネットワークタイプをロックする（以降は変更しない） ---
    if (!lockedNetworkType) lockedNetworkType = detectedNetworkType;
    const networkType = lockedNetworkType;

    // --- 状態をセット ---
    appState.currentPubKey = pubKey;
    appState.networkType = networkType;

    const isTestnet = networkType === NetworkType.TESTNET;
    setText("network-label", networkLabel(networkType));

    /* ------------------------------------------------------
      1. NodeWatch でノード選択
    ------------------------------------------------------ */
    appState.NODE = await selectNode(isTestnet);

    console.log("sss.js  Selected NODE:", appState.NODE);

    /* ------------------------------------------------------
      2. SDK 初期化（選択した NODE に接続）
    ------------------------------------------------------ */
    await initSdk();

    /* ------------------------------------------------------
      3. アカウント生成
    ------------------------------------------------------ */
    const pub = new appState.sdkCore.PublicKey(pubKey);
    const publicAccount = appState.facade.createPublicAccount(pub);
    appState.currentAddress = publicAccount.address;

    setText("account-address", publicAccount.address.toString());
    setStatus("sss-status", "SSS と接続済み", "success");

    /* ------------------------------------------------------
      4. UI ボタンの有効化（存在する要素のみ）
    ------------------------------------------------------ */
    ["btn-transfer", "btn-update-meta"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });

    /* ------------------------------------------------------
      5. アカウント情報 / TX を読み込み
    ------------------------------------------------------ */
    await refreshAccount();

    await loadRecentTx();

    // --- 完全に接続完了 ---
    //isConnectedOnce = true;

  } catch (e) {
    console.error("internalConnect error:", e);
  } finally {
    isConnecting = false;
  }
}

/* ------------------------------------------------------
  手動接続ボタン用
------------------------------------------------------ */
/*export async function connectSSS() {
  await internalConnect(false);
}*/

/* ------------------------------------------------------
  自動接続（activePublicKey があれば即接続）
------------------------------------------------------ */
export async function autoConnectSSS() {
  await internalConnect(true);
}
