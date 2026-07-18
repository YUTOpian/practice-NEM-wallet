import { appState } from "./config.js";
import { autoConnectSSS } from "./sss.js";
import { refreshAccount } from "./account.js";
import { sendTx } from "./transfer.js";
import { loadRecentTx, initLiveTx } from "./transactions.js";
import { initWebSocket } from "./ws.js";
import { initSdk } from "./sdk.js";
import { showPopup } from "./utils.js";
import { checkHarvestStatus } from "./harvest.js";
//import QRCode from "https://esm.sh/qrcode";

window.addEventListener("load", async () => {
  // ============================
  // SSS初期化
  // ============================
  await new Promise(resolve => setTimeout(resolve, 1000));
  await autoConnectSSS();

  if (!window.SSS || !window.SSS.activePublicKey) {
    showPopup("⚠️ SSS Extension とリンクしてください", true);
    return;
  }

  // ============================
  // SDK初期化・アカウント取得
  // ============================
  await initSdk();
  await refreshAccount();

  // ============================
  // ページ要素取得
  // ============================
  const accountPage = document.getElementById("account-page");
  const sendPage = document.getElementById("send-page");
  const transferPage = document.getElementById("transfer-page");
  const receivePage = document.getElementById("receive-page");
  const harvestPage = document.getElementById("harvest-page");

  // ============================
// タブ
// ============================
const tokenTab = document.getElementById("token-tab");
const activityTab = document.getElementById("activity-tab");

const tokenPanel = document.getElementById("token-panel");
const activityPanel = document.getElementById("activity-panel");

tokenTab?.addEventListener("click", () => {

  tokenTab.classList.add("active");
  activityTab.classList.remove("active");

  tokenPanel.classList.add("active");
  activityPanel.classList.remove("active");

});

activityTab?.addEventListener("click", () => {

  activityTab.classList.add("active");
  tokenTab.classList.remove("active");

  activityPanel.classList.add("active");
  tokenPanel.classList.remove("active");

});

  
  // ============================
  // ページ切替共通関数
  // ============================
  function showPage(page) {
    document.querySelectorAll(".page").forEach(p => {
      p.classList.remove("active");
    });
    page.classList.add("active");
  }

  // ============================
  // 送金ボタン (account -> mosaic選択)
  // ============================
  document.getElementById("send-btn")?.addEventListener("click", () => {
    console.log("送金画面へ");
    showPage(sendPage);

    const sendList = document.getElementById("send-mosaic-list");
    const mosaicList = document.getElementById("mosaic-list");

    if (!sendList || !mosaicList) {
      console.log("モザイク一覧取得失敗");
      return;
    }

    // 保有モザイク一覧コピー
    sendList.innerHTML = mosaicList.innerHTML;
    console.log("送金一覧件数:", sendList.querySelectorAll(".mosaic-item").length);
  });

  // ============================
  // モザイク選択 (mosaic -> transfer入力)
  // ============================
  document.getElementById("send-mosaic-list")?.addEventListener("click", e => {
    const item = e.target.closest(".mosaic-item");
    if (!item) return;

    console.log("モザイククリック", item);

    const name = item.querySelector(".mosaic-name")?.textContent.trim();
    const id = item.querySelector(".mosaic-id")?.textContent.trim();
    const amount = item.querySelector(".mosaic-amount")?.textContent.trim();

    document.getElementById("selected-mosaic-name").textContent = name;
    document.getElementById("selected-mosaic-id").value = id;
    document.getElementById("selected-mosaic-balance").textContent = amount;

    showPage(transferPage);
  });

// ============================
// タブ切り替え
// ============================

const tabToken = document.getElementById("tab-token");
const tabActivity = document.getElementById("tab-activity");

const tokenContent = document.getElementById("token-content");
const activityContent = document.getElementById("activity-content");

tabToken?.addEventListener("click", () => {

  tabToken.classList.add("active");
  tabActivity.classList.remove("active");

  tokenContent.style.display = "block";
  activityContent.style.display = "none";

});

tabActivity?.addEventListener("click", () => {

  tabActivity.classList.add("active");
  tabToken.classList.remove("active");

  tokenContent.style.display = "none";
  activityContent.style.display = "block";

});

  
  // ============================
  // 画面遷移：戻るボタン各種
  // ============================
  document.getElementById("back-account")?.addEventListener("click", () => {
    showPage(accountPage);
  });

  document.getElementById("back-send")?.addEventListener("click", () => {
    showPage(sendPage);
  });

  document.getElementById("back-account-receive")?.addEventListener("click", () => {
    showPage(accountPage);
  });

  // ============================
  // 送金実行
  // ============================
  document.getElementById("btn-transfer")?.addEventListener("click", sendTx);

  // ============================
  // 受け取り画面表示
  // ============================
  document.getElementById("receive-btn")?.addEventListener("click", async () => {
    console.log("受取画面");
    showPage(receivePage);

    const address = document.getElementById("account-address").textContent.trim();

    // アドレス表示とQRコード生成
    document.getElementById("receive-address").textContent = address;
    const qr = document.getElementById("receive-qrcode");
    qr.innerHTML = "";

const dataUrl = await QRCode.toDataURL(address, {
    width: 220,
    margin: 1
});

qr.innerHTML = `<img src="${dataUrl}" alt="QR Code">`;
  });

// ============================
// ハーベスト画面表示
// ============================
document.getElementById("harvest-btn")?.addEventListener("click", async () => {

  console.log("ハーベスト画面へ");

  showPage(harvestPage);


  const address =
    document.getElementById("account-address")
      .textContent
      .trim();


  document.getElementById("harvest-address")
    .textContent = address;


  await checkHarvestStatus();

});

// ============================
// ハーベスト画面 戻る
// ============================
document.getElementById("back-account-harvest")?.addEventListener("click", () => {

  showPage(accountPage);

});

  // ============================
  // アドレスコピー
  // ============================
  document.getElementById("copy-address-btn")?.addEventListener("click", () => {
    const addr = document.getElementById("account-address").textContent.trim();

    navigator.clipboard.writeText(addr).then(() => {
      showPopup("アドレスをコピーしました");
    });
  });

  // ============================
  // 取引履歴の読み込み & WebSocket同期開始
  // ============================
  await loadRecentTx();

  if (appState.currentAddress) {
    initWebSocket(appState.currentAddress.toString());
    initLiveTx(appState.currentAddress.toString());
  }
});
