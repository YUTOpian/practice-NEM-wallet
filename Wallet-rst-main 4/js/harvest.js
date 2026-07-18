// harvest.js
import { appState } from "./config.js";

/* ============================================================
   ハーベスト状態確認
============================================================ */
export async function checkHarvestStatus() {
  const statusEl = document.getElementById("harvest-status");

  if (!statusEl) {
    console.log("harvest-status がありません");
    return;
  }

  try {
    console.log("ハーベスト状態確認開始");
    const address = appState.currentAddress.toString();
    console.log("確認アドレス:", address);

    statusEl.textContent = "状態確認中...";

    const url = `${appState.NODE}/accounts/${address}`;
    console.log("REST URL:", url);

    const res = await fetch(url);
    console.log("レスポンス:", res.status);

    const json = await res.json();
    console.log("JSON:", json);

    const account = json.account;
    if (!account) {
      statusEl.textContent = "アカウント情報取得失敗";
      return;
    }

    const importance = account.importance;
    console.log("importance:", importance);

    if (importance && Number(importance) > 0) {
      statusEl.textContent = "✅ ハーベスト可能状態";
    } else {
      statusEl.textContent = "❌ ハーベスト未設定";
    }

  } catch (e) {
    console.error("Harvest status error:", e);
    statusEl.textContent = "状態取得エラー";
  }
}
