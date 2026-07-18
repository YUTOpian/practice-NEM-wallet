import { appState } from "./config.js";
import { autoConnectSSS } from "./sss.js";
import { refreshAccount } from "./account.js";
import { sendTx } from "./transfer.js";
import { loadRecentTx, initLiveTx } from "./transactions.js";
import { initWebSocket } from "./ws.js";
import { initSdk } from "./sdk.js";
import { showPopup } from "./utils.js";
import { checkHarvestStatus } from "./harvest.js";
// import QRCode from "https://esm.sh/qrcode";

window.addEventListener("load", async () => {

  // ======================================
  // ページ取得
  // ======================================

  const welcomePage = document.getElementById("welcome-page");
  const sssPage = document.getElementById("sss-page");
  const localPage = document.getElementById("local-page");

  const accountPage = document.getElementById("account-page");
  const sendPage = document.getElementById("send-page");
  const transferPage = document.getElementById("transfer-page");
  const receivePage = document.getElementById("receive-page");
  const harvestPage = document.getElementById("harvest-page");

  // ======================================
  // ページ切替
  // ======================================

  function showPage(page) {

    document.querySelectorAll(".page").forEach((p) => {
      p.classList.remove("active");
    });

    page.classList.add("active");

  }

  // 最初はWelcome画面
  showPage(welcomePage);

  // ======================================
  // Welcome
  // ======================================

  document
    .getElementById("select-sss")
    ?.addEventListener("click", () => {

      showPage(sssPage);

    });

  document
    .getElementById("select-local")
    ?.addEventListener("click", () => {

      showPage(localPage);

    });

  // ======================================
  // 戻る
  // ======================================

  document
    .getElementById("back-welcome-sss")
    ?.addEventListener("click", () => {

      showPage(welcomePage);

    });

  document
    .getElementById("back-welcome-local")
    ?.addEventListener("click", () => {

      showPage(welcomePage);

    });

  // ======================================
  // SSS接続
  // ======================================

  document
    .getElementById("connect-sss")
    ?.addEventListener("click", async () => {

      await new Promise((resolve) => setTimeout(resolve, 1000));

      await autoConnectSSS();

      if (!window.SSS || !window.SSS.activePublicKey) {

        showPopup("⚠️ SSS Extension とリンクしてください", true);
        return;

      }

      await initSdk();
      await refreshAccount();

      showPage(accountPage);

      await loadRecentTx();

      if (appState.currentAddress) {

        initWebSocket(appState.currentAddress.toString());
        initLiveTx(appState.currentAddress.toString());

      }

    });

  // ======================================
  // Localモード
  // ======================================

  document
    .getElementById("import-wallet")
    ?.addEventListener("click", () => {

      showPage(document.getElementById("import-page"));

    });

  document
    .getElementById("create-wallet")
    ?.addEventListener("click", () => {

      showPage(document.getElementById("create-page"));

    });

  // ======================================
  // タブ切替
  // ======================================

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

  // ======================================
  // 送金画面へ
  // ======================================

  document
    .getElementById("send-btn")
    ?.addEventListener("click", () => {

      showPage(sendPage);

      const sendList =
        document.getElementById("send-mosaic-list");

      const mosaicList =
        document.getElementById("mosaic-list");

      if (!sendList || !mosaicList) {
        return;
      }

      sendList.innerHTML = mosaicList.innerHTML;

    });

  // ======================================
  // モザイク選択
  // ======================================

  document
    .getElementById("send-mosaic-list")
    ?.addEventListener("click", (e) => {

      const item =
        e.target.closest(".mosaic-item");

      if (!item) {
        return;
      }

      const name =
        item.querySelector(".mosaic-name")?.textContent.trim();

      const id =
        item.querySelector(".mosaic-id")?.textContent.trim();

      const amount =
        item.querySelector(".mosaic-amount")?.textContent.trim();

      document.getElementById("selected-mosaic-name").textContent = name;

      document.getElementById("selected-mosaic-id").value = id;

      document.getElementById("selected-mosaic-balance").textContent = amount;

      showPage(transferPage);

    });

  // ======================================
  // 戻る
  // ======================================

  document
    .getElementById("back-account")
    ?.addEventListener("click", () => {

      showPage(accountPage);

    });

  document
    .getElementById("back-send")
    ?.addEventListener("click", () => {

      showPage(sendPage);

    });

  // ======================================
  // 送金
  // ======================================

  document
    .getElementById("btn-transfer")
    ?.addEventListener("click", async () => {

      await sendTx();

    });

  // ======================================
  // ローカルウォレット
  // ======================================

  document
    .getElementById("back-local-import")
    ?.addEventListener("click", () => {

      showPage(localPage);

    });

  document
    .getElementById("mnemonic-confirm")
    ?.addEventListener("change", (e) => {

      document.getElementById("btn-next-pin").disabled =
        !e.target.checked;

    });

  document
    .getElementById("btn-next-pin")
    ?.addEventListener("click", () => {

      showPage(document.getElementById("pin-page"));

    });

  document
    .getElementById("btn-save-pin")
    ?.addEventListener("click", () => {

      const pin1 =
        document.getElementById("pin1").value;

      const pin2 =
        document.getElementById("pin2").value;

      if (pin1.length < 4) {

        showPopup("PINは4桁以上入力してください", true);
        return;

      }

      if (pin1 !== pin2) {

        showPopup("PINが一致しません", true);
        return;

      }

      showPopup("PINを保存しました");

      showPage(accountPage);

    });

  // ======================================
  // 受け取り画面
  // ======================================

  document
    .getElementById("receive-btn")
    ?.addEventListener("click", async () => {

      showPage(receivePage);

      const address =
        document.getElementById("account-address")
          .textContent
          .trim();

      document.getElementById("receive-address").textContent = address;

      const qr =
        document.getElementById("receive-qrcode");

      qr.innerHTML = "";

      if (typeof QRCode !== "undefined") {

        const dataUrl = await QRCode.toDataURL(address, {
          width: 220,
          margin: 1
        });

        qr.innerHTML = `<img src="${dataUrl}" alt="QR Code">`;

      }

    });

  document
    .getElementById("back-account-receive")
    ?.addEventListener("click", () => {

      showPage(accountPage);

    });

  // ======================================
  // Harvest
  // ======================================

  document
    .getElementById("harvest-btn")
    ?.addEventListener("click", async () => {

      showPage(harvestPage);

      const address =
        document.getElementById("account-address")
          .textContent
          .trim();

      document.getElementById("harvest-address").textContent = address;

      await checkHarvestStatus();

    });

  document
    .getElementById("back-account-harvest")
    ?.addEventListener("click", () => {

      showPage(accountPage);

    });

  // ======================================
  // アドレスコピー
  // ======================================

  document
    .getElementById("copy-address-btn")
    ?.addEventListener("click", () => {

      const address =
        document.getElementById("account-address")
          .textContent
          .trim();

      navigator.clipboard.writeText(address);

      showPopup("アドレスをコピーしました");

    });

  document
    .getElementById("copy-receive-address")
    ?.addEventListener("click", () => {

      const address =
        document.getElementById("receive-address")
          .textContent
          .trim();

      navigator.clipboard.writeText(address);

      showPopup("アドレスをコピーしました");

    });

  // ======================================
  // 初期読込
  // ======================================

  if (appState.currentAddress) {

    await loadRecentTx();

    initWebSocket(
      appState.currentAddress.toString()
    );

    initLiveTx(
      appState.currentAddress.toString()
    );

  }

});

  


                        
