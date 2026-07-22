// settings.js
// 設定メニュー: 接続先ノードの変更 / 送金手数料の設定 (NIS1版)

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
      infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, nodeOrigin: targetOrigin });
    }
    showCurrentNode();

    setStatus("node-settings-status", "✅ ノードを切り替えました。", "success");
  } catch (e) {
    console.error("applyNodeChange error:", e);
    setStatus("node-settings-status", "ノードへの接続に失敗しました。", "error");
  }
}

/* ============================================================
   送金手数料の設定
   NIS1は /network/fees/transaction のような手数料スケジュールAPIが無く、
   手数料計算式もモザイクの有無等で変わり複雑なため、
   ここでは「基準手数料に対する倍率」をシンプルに指定する方式にしている。
============================================================ */

const PRESETS = { slow: 1, average: 2, fast: 5 };

function renderFeeOption(elId, multiplier) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = `手数料倍率: ${multiplier}倍`;
  el.closest(".fee-option")?.setAttribute("data-multiplier", String(multiplier));
}

export async function loadFeeSettings() {
  const customInput = document.getElementById("fee-custom-input");
  if (customInput) customInput.value = appState.feeMultiplier ?? 1;

  renderFeeOption("fee-slow-value", PRESETS.slow);
  renderFeeOption("fee-average-value", PRESETS.average);
  renderFeeOption("fee-fast-value", PRESETS.fast);

  setStatus("fee-settings-status", "", "default");
}

export function selectFeeOption(optionEl) {
  const multiplier = optionEl?.getAttribute("data-multiplier");
  if (multiplier == null) return;

  document.querySelectorAll(".fee-option").forEach((el) => el.classList.remove("selected"));
  optionEl.classList.add("selected");

  const customInput = document.getElementById("fee-custom-input");
  if (customInput) customInput.value = multiplier;
}

export function applyFeeSettings() {
  const raw = document.getElementById("fee-custom-input")?.value;
  const multiplier = Number(raw);

  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    setStatus("fee-settings-status", "手数料の値が不正です。", "error");
    return;
  }

  appState.feeMultiplier = multiplier;

  try {
    localStorage.setItem("feeMultiplier", String(appState.feeMultiplier));
  } catch (e) {
    console.warn("feeMultiplierの保存に失敗しました", e);
  }

  setStatus("fee-settings-status", `✅ 送金手数料倍率を ${appState.feeMultiplier}倍 に設定しました。`, "success");
}
