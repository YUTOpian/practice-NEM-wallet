// settings.js
// 設定メニュー: 接続先ノードの変更 (NIS1版)
// ※ 送金手数料の設定機能は廃止した(常にappState.feeMultiplierの既定値=1を使用)

import { appState, NetworkType } from "./config.js";
import { setStatus } from "./ui.js";
import { initSdk } from "./sdk.js";
import { refreshAccount } from "./account.js";
import { loadRecentTx, initLiveTx } from "./transactions.js";
import { initWebSocket, closeWebSocket } from "./ws.js";
import { renderNodeInfoHtml } from "./utils.js";
import { fetchReachablePeers } from "./nodeSelector.js";

/* ============================================================
   接続先ノードの変更
============================================================ */

export function showCurrentNode() {
  const el = document.getElementById("current-node-display");
  if (el) el.textContent = appState.NODE ?? "---";
}

export async function loadNodeSettingsCandidates() {
  const select = document.getElementById("node-settings-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- 候補を読み込み中... --</option>`;

  try {
    const peers = await fetchReachablePeers(appState.NODE);

    if (peers.length === 0) {
      select.innerHTML = `<option value="">-- 候補が見つかりません(下に直接URLを入力してください) --</option>`;
      return;
    }

    select.innerHTML =
      `<option value="">-- ノードを選択 --</option>` +
      peers.map((url) => `<option value="${url}">${url}</option>`).join("");
  } catch (e) {
    console.warn("ノード候補の取得に失敗しました", e);
    select.innerHTML = `<option value="">-- 候補の取得に失敗（下に直接URLを入力してください）--</option>`;
  }
}

function getSelectedNodeUrl() {
  const manual = document.getElementById("node-settings-input")?.value?.trim();
  if (manual) return manual;

  const selected = document.getElementById("node-settings-select")?.value?.trim();
  if (selected) return selected;

  return "";
}

export async function applyNodeChange() {
  const targetRaw = getSelectedNodeUrl();

  if (!targetRaw) {
    setStatus("node-settings-status", "ノードを選択するかURLを入力してください。", "error");
    return;
  }

  let targetOrigin;
  try {
    const u = new URL(targetRaw);
    if (u.protocol !== "https:") {
      setStatus(
        "node-settings-status",
        "このアプリはHTTPS対応ノードにのみ接続できます(http://は指定できません)。",
        "error"
      );
      return;
    }
    targetOrigin = u.origin;
  } catch {
    setStatus("node-settings-status", "ノードURLの形式が正しくありません。", "error");
    return;
  }

  setStatus("node-settings-status", `接続確認中... (${targetOrigin})`);

  try {
    // NIS1には /network/properties のようなネットワーク自己申告APIが無いため、
    // ここでは「応答するかどうか」のみ確認する。
    // Mainnet/Testnetを取り違えたノードを選ばないよう、ご自身でご注意ください。
    const res = await fetch(new URL("/chain/height", targetOrigin));
    if (!res.ok) throw new Error("応答がありません");

    closeWebSocket();
    appState.NODE = targetOrigin;

    await initSdk();
    await refreshAccount();
    await loadRecentTx();

    if (appState.currentAddress) {
      const address = appState.currentAddress.toString();
      initWebSocket(address);
      initLiveTx(address);
    }

    const isTestnet = appState.networkType === NetworkType.TESTNET;
    const infoEl = document.getElementById("node-info");
    if (infoEl) {
      infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: true });
    }
    showCurrentNode();

    setStatus("node-settings-status", "✅ ノードを切り替えました。", "success");
  } catch (e) {
    console.error("applyNodeChange error:", e);
    setStatus("node-settings-status", "ノードへの接続に失敗しました。", "error");
  }
}
