// index.js

import { appState } from "./config.js";
import { connectSSS } from "./sss.js";
import { importMnemonic, unlockStoredMnemonic, hasStoredMnemonic, forgetStoredMnemonic } from "./mnemonic.js";
import { sendTx } from "./transfer.js";
import { showPopup } from "./utils.js";
import { checkHarvestStatus, startHarvest, stopHarvest, loadHarvestNodeCandidates } from "./harvest.js";
import QRCode from "https://esm.sh/qrcode";
import { QRCodeGenerator } from "https://esm.sh/symbol-qr-library";

window.addEventListener("load", async () => {
  // ============================
  // ページ取得
  // ============================
  const connectPage = document.getElementById("connect-page");
  const accountPage = document.getElementById("account-page");
  const sendPage = document.getElementById("send-page");
  const transferPage = document.getElementById("transfer-page");
  const receivePage = document.getElementById("receive-page");
  const harvestPage = document.getElementById("harvest-page");

  // ============================
  // ページ切替
  // ============================
  function showPage(page) {
    document.querySelectorAll(".page").forEach(p => {
      p.classList.remove("active");
    });
    page.classList.add("active");
  }

  // ============================
  // 接続完了後: アカウント画面へ
  // ============================
  function onConnected() {
    showPage(accountPage);
  }

  // ============================
  // SSS Extensionで接続
  // ============================
  document.getElementById("connect-sss-btn")?.addEventListener("click", async () => {
    if (!window.SSS) {
      showPopup("⚠️ SSS Extensionが見つかりません", true);
      return;
    }
    try {
      await connectSSS();
      if (!appState.currentAddress) {
        showPopup("⚠️ SSSでアカウントを選択してください", true);
        return;
      }
      onConnected();
    } catch (e) {
      console.error("SSS接続エラー:", e);
      showPopup("❌ SSS接続に失敗しました", true);
    }
  });

  // ============================
  // ニーモニックログイン
  // ============================
  if (hasStoredMnemonic()) {
    const storedBox = document.getElementById("mnemonic-has-stored");
    if (storedBox) storedBox.style.display = "block";
  }

  document.getElementById("mnemonic-unlock-btn")?.addEventListener("click", async () => {
    const password = document.getElementById("mnemonic-password-input")?.value ?? "";
    const isTestnet = document.getElementById("mnemonic-network-select")?.value === "testnet";

    try {
      await unlockStoredMnemonic(password, { isTestnet, accountIndex: 0 });
      onConnected();
    } catch (e) {
      console.error("ニーモニックログインエラー:", e);
      showPopup("❌ " + e.message, true);
    }
  });

  document.getElementById("mnemonic-forget-btn")?.addEventListener("click", () => {
    if (!confirm("保存されたニーモニックを削除します。よろしいですか？")) return;
    forgetStoredMnemonic();
    const storedBox = document.getElementById("mnemonic-has-stored");
    if (storedBox) storedBox.style.display = "none";
    showPopup("保存されたニーモニックを削除しました");
  });

  document.getElementById("mnemonic-import-btn")?.addEventListener("click", async () => {
    const mnemonic = document.getElementById("mnemonic-input")?.value.trim() ?? "";
    const isTestnet = document.getElementById("mnemonic-network-select")?.value === "testnet";
    const accountIndex = Number(document.getElementById("mnemonic-account-index")?.value || 0);
    const password = document.getElementById("mnemonic-new-password")?.value ?? "";

    if (!mnemonic) {
      showPopup("⚠️ ニーモニックを入力してください", true);
      return;
    }

    try {
      await importMnemonic(mnemonic, { isTestnet, accountIndex, password: password || null });
      onConnected();
    } catch (e) {
      console.error("ニーモニックインポートエラー:", e);
      showPopup("❌ インポートに失敗しました: " + e.message, true);
    }
  });

  // ============================
  // 送金画面
  // ============================
  document.getElementById("send-btn")?.addEventListener("click", () => {
    showPage(sendPage);
    const sendList = document.getElementById("send-mosaic-list");
    const mosaicList = document.getElementById("mosaic-list");

    if (sendList && mosaicList) {
      sendList.innerHTML = mosaicList.innerHTML;
    }
  });

  // ============================
  // モザイク選択
  // ============================
  document.getElementById("send-mosaic-list")?.addEventListener("click", e => {
    const item = e.target.closest(".mosaic-item");
    if (!item) return;

    document.getElementById("selected-mosaic-name").textContent = 
      item.querySelector(".mosaic-name")?.textContent;

    document.getElementById("selected-mosaic-id").value = 
      item.querySelector(".mosaic-id")?.textContent;

    showPage(transferPage);
  });

  // ============================
  // 送金実行
  // ============================
  document.getElementById("btn-transfer")?.addEventListener("click", sendTx);

  // ============================
  // 受取画面
  // ============================
  document.getElementById("receive-btn")?.addEventListener("click", async () => {
    showPage(receivePage);
    const address = appState.currentAddress.toString();

    document.getElementById("receive-address").textContent = address;
    const qr = document.getElementById("receive-qrcode");
    qr.innerHTML = "生成中...";

    try {
      // Symbol公式のAddressQR形式（symbol-qr-library）でQRコードを生成する。
      // 単なるアドレス文字列のQRだと、他のSymbolウォレット（EXYM Walletなど）が
      // アドレスQRとして認識できないため。
      if (!appState.generationHash) {
        throw new Error("generationHashが未取得です（SDK初期化未完了の可能性）");
      }

      const walletName = "Symbol Simple Wallet";
      const qrCode = QRCodeGenerator.createExportAddress(
        walletName,
        address,
        appState.networkType, // 104:MAINNET / 152:TESTNET （数値はSDK v2でも同じ）
        appState.generationHash
      );

      // toBase64() は Observable を返すのでsubscribeで受け取る
      qrCode.toBase64().subscribe({
        next: (base64) => {
          qr.innerHTML = `<img src="data:image/png;base64,${base64}" alt="Address QR Code">`;
        },
        error: (e) => {
          console.error("QRコード生成エラー(symbol-qr-library):", e);
          qr.innerHTML = "QRコード生成に失敗しました（コンソールを確認してください）";
        }
      });
    } catch (e) {
      console.error("QRコード生成エラー:", e);
      qr.innerHTML = "QRコード生成に失敗しました（コンソールを確認してください）";
    }
  });

  // ============================
  // ハーベスト画面
  // ============================
  document.getElementById("harvest-btn")?.addEventListener("click", async () => {
    showPage(harvestPage);
    const address = appState.currentAddress.toString();
    document.getElementById("harvest-address").textContent = address;

    await checkHarvestStatus();
    await loadHarvestNodeCandidates();
  });

  // ============================
  // ハーベスト開始
  // ============================
  document.getElementById("start-harvest-btn")?.addEventListener("click", startHarvest);
  document.getElementById("stop-harvest-btn")?.addEventListener("click", stopHarvest);

  // ============================
  // 戻る
  // ============================
  document.getElementById("back-account")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-send")?.addEventListener("click", () => showPage(sendPage));
  document.getElementById("back-account-receive")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-harvest")?.addEventListener("click", () => showPage(accountPage));

  // ============================
  // タブ切替
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
  // アドレスコピー
  // ============================
  document.getElementById("copy-address-btn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(appState.currentAddress.toString());
    showPopup("アドレスをコピーしました");
  });
});
