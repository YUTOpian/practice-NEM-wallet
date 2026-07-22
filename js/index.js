// index.js

import { appState, NetworkType } from "./config.js";
import { sendTx } from "./transfer.js";
import { loadRecentTx, initLiveTx } from "./transactions.js";
import { initWebSocket } from "./ws.js";
import { showPopup } from "./utils.js";
import { setStatus } from "./ui.js";
import { checkHarvestStatus, startHarvest, stopHarvest, loadHarvestNodeCandidates, loadHarvestHistory } from "./harvest.js";
import {
  showCurrentNode,
  loadNodeSettingsCandidates,
  applyNodeChange,
  loadFeeSettings,
  selectFeeOption,
  applyFeeSettings,
} from "./settings.js";
import {
  connectWithSSS,
  loginWithMnemonic,
  getVaultMode,
  restorePlainVault,
  unlockVault,
  saveVault,
  clearVault,
  logout,
  switchToAccount,
  setAccountHidden,
  addAccountFromMnemonic,
  addAccountFromPrivateKey,
  addNextAccountFromCurrentMnemonic,
  hasCurrentMnemonic,
} from "./auth.js";
import {
  updateSwitcherVisibility,
  renderAccountSwitcherList,
  renderHiddenAccountList,
  nextMnemonicAccountIndex,
} from "./accountSwitcher.js";
import {
  loadOwnedNamespaces,
  populateParentNamespaceSelect,
  registerRootNamespace,
  registerChildNamespace,
} from "./namespace.js";
import {
  loadOwnedMosaicsWithAlias,
  populateMosaicNamespaceSelect,
  createMosaic,
  linkNamespaceToMosaic,
  fetchOwnedNamespaceOptions,
  fetchOwnedMosaicIds,
} from "./mosaic.js";
import { setMetadata, loadOwnMetadataList } from "./metadata.js";
import {
  loadMultisigInfo,
  fetchCosignatoryOfAddresses,
  updateMultisigSettings,
  sendFromMultisig,
  loadPendingPartialTransactions,
  cosignPending,
} from "./multisig.js";
import { parseCsv, sendMultiTransfer } from "./multisend.js";
import { computeFileHash, createApostille, searchApostilleTransactions } from "./apostille.js";
import {
  loadAccountRestrictions,
  setAddressRestriction,
  setMosaicRestriction,
  setOperationRestriction,
  OPERATION_TYPE_OPTIONS,
} from "./restriction.js";
import QRCode from "https://esm.sh/qrcode";
import { QRCodeGenerator } from "https://esm.sh/symbol-qr-library";
import { firstValueFrom } from "https://esm.sh/rxjs";

window.addEventListener("load", async () => {
  // ============================
  // ページ取得
  // ============================
  const welcomePage = document.getElementById("welcome-page");
  const mnemonicImportPage = document.getElementById("mnemonic-import-page");
  const passwordSetupPage = document.getElementById("password-setup-page");
  const unlockPage = document.getElementById("unlock-page");
  const accountPage = document.getElementById("account-page");
  const sendPage = document.getElementById("send-page");
  const transferPage = document.getElementById("transfer-page");
  const receivePage = document.getElementById("receive-page");
  const harvestPage = document.getElementById("harvest-page");
  const settingsPage = document.getElementById("settings-page");
  const nodeSettingsPage = document.getElementById("node-settings-page");
  const feeSettingsPage = document.getElementById("fee-settings-page");
  const accountSwitcherPage = document.getElementById("account-switcher-page");
  const hiddenAccountsPage = document.getElementById("hidden-accounts-page");
  const addAccountMenuPage = document.getElementById("add-account-menu-page");
  const addAccountMnemonicPage = document.getElementById("add-account-mnemonic-page");
  const addAccountPrivatekeyPage = document.getElementById("add-account-privatekey-page");
  const advancedPage = document.getElementById("advanced-page");
  const namespacePage = document.getElementById("namespace-page");
  const mosaicPage = document.getElementById("mosaic-page");
  const metadataPage = document.getElementById("metadata-page");
  const multisigMenuPage = document.getElementById("multisig-menu-page");
  const multisigSettingsPage = document.getElementById("multisig-settings-page");
  const multisigSendPage = document.getElementById("multisig-send-page");
  const multisigSignPage = document.getElementById("multisig-sign-page");
  const multisendMenuPage = document.getElementById("multisend-menu-page");
  const multisendCsvPage = document.getElementById("multisend-csv-page");
  const multisendListPage = document.getElementById("multisend-list-page");
  const apostilleMenuPage = document.getElementById("apostille-menu-page");
  const apostilleCreatePage = document.getElementById("apostille-create-page");
  const apostilleVerifyPage = document.getElementById("apostille-verify-page");
  const apostilleHistoryPage = document.getElementById("apostille-history-page");
  const restrictionMenuPage = document.getElementById("restriction-menu-page");
  const restrictionAddressPage = document.getElementById("restriction-address-page");
  const restrictionMosaicPage = document.getElementById("restriction-mosaic-page");
  const restrictionOperationPage = document.getElementById("restriction-operation-page");

  // ============================
  // ページ切替
  // ============================
  function showPage(page) {
    document.querySelectorAll(".page").forEach(p => {
      p.classList.remove("active");
    });
    page.classList.add("active");
  }

  function goHome() {
    updateSwitcherVisibility();
    showPage(accountPage);
  }

  // ============================
  // 起動時の初期画面判定
  // - パスワード設定済み(暗号化保存) → ロック解除画面
  // - パスワード未設定だが保存あり(平文保存) → 確認なしでそのまま自動ログイン
  // - 何も保存されていない → ログイン方法選択画面
  // ============================
  const vaultMode = getVaultMode();
  if (vaultMode === "encrypted") {
    showPage(unlockPage);
  } else if (vaultMode === "plain") {
    try {
      await restorePlainVault();
      goHome();
    } catch (e) {
      console.error("restorePlainVault error:", e);
      showPage(welcomePage);
    }
  } else {
    showPage(welcomePage);
  }

  // ============================
  // SSS Extensionと接続
  // ============================
  document.getElementById("choose-sss")?.addEventListener("click", async () => {
    setStatus("welcome-status", "SSS Extensionに接続中...");
    try {
      await connectWithSSS();
      goHome();
    } catch (e) {
      console.error("connectWithSSS error:", e);
      setStatus("welcome-status", e.message || "SSS Extensionとの接続に失敗しました。", "error");
    }
  });

  // ============================
  // ニーモニックインポート画面へ
  // ============================
  document.getElementById("choose-mnemonic")?.addEventListener("click", () => {
    showPage(mnemonicImportPage);
  });

  document.getElementById("back-welcome-mnemonic")?.addEventListener("click", () => showPage(welcomePage));

  document.getElementById("import-mnemonic-btn")?.addEventListener("click", async () => {
    const mnemonicPhrase = document.getElementById("mnemonic-input").value.trim();
    const networkChoice = document.getElementById("mnemonic-network-select").value;
    const networkType = networkChoice === "testnet" ? NetworkType.TESTNET : NetworkType.MAINNET;

    if (!mnemonicPhrase) {
      setStatus("mnemonic-import-status", "ニーモニックを入力してください。", "error");
      return;
    }

    setStatus("mnemonic-import-status", "インポート中...");
    try {
      await loginWithMnemonic(mnemonicPhrase, networkType);
      document.getElementById("mnemonic-input").value = "";
      setStatus("mnemonic-import-status", "", "default");
      showPage(passwordSetupPage);
    } catch (e) {
      console.error("loginWithMnemonic error:", e);
      setStatus("mnemonic-import-status", e.message || "インポートに失敗しました。", "error");
    }
  });

  // ============================
  // パスワード設定(任意)
  // この時点でアカウントは既にappState.accountsに追加済みなので、
  // saveVaultはパスワードだけ受け取って現在のアカウント一覧を暗号化保存する
  // ============================
  document.getElementById("save-password-btn")?.addEventListener("click", async () => {
    const pw = document.getElementById("setup-password-input").value;
    const pwConfirm = document.getElementById("setup-password-confirm").value;

    if (!pw || pw.length < 8) {
      setStatus("password-setup-status", "8文字以上のパスワードを入力してください。", "error");
      return;
    }
    if (pw !== pwConfirm) {
      setStatus("password-setup-status", "パスワードが一致しません。", "error");
      return;
    }

    try {
      await saveVault(pw);
      document.getElementById("setup-password-input").value = "";
      document.getElementById("setup-password-confirm").value = "";
      goHome();
    } catch (e) {
      console.error("saveVault error:", e);
      setStatus("password-setup-status", "保存に失敗しました。", "error");
    }
  });

  // ============================
  // ロック解除(保存済みアカウントでログイン)
  // ============================
  document.getElementById("unlock-btn")?.addEventListener("click", async () => {
    const pw = document.getElementById("unlock-password-input").value;
    if (!pw) {
      setStatus("unlock-status", "パスワードを入力してください。", "error");
      return;
    }
    setStatus("unlock-status", "ログイン中...");
    try {
      await unlockVault(pw);
      document.getElementById("unlock-password-input").value = "";
      goHome();
    } catch (e) {
      console.error("unlockVault error:", e);
      setStatus("unlock-status", e.message || "ログインに失敗しました。", "error");
    }
  });

  document.getElementById("unlock-sss-btn")?.addEventListener("click", async () => {
    setStatus("unlock-status", "SSS Extensionに接続中...");
    try {
      await connectWithSSS();
      goHome();
    } catch (e) {
      console.error("connectWithSSS error:", e);
      setStatus("unlock-status", e.message || "SSS Extensionとの接続に失敗しました。", "error");
    }
  });

  document.getElementById("forget-account-btn")?.addEventListener("click", () => {
    if (!confirm(
      "この端末に保存されているアカウント情報を削除します。\n" +
      "（ニーモニックや秘密鍵をメモ・保管していれば、資産自体がなくなることはありません。このアプリからのログイン情報が消えるだけです）\n\n" +
      "削除してよろしいですか？"
    )) return;
    clearVault();
    showPage(welcomePage);
  });

  // 送金画面に「保有トークン一覧」から直接入ったかどうか
  let cameFromMosaicList = false;
  const backSendBtn = document.getElementById("back-send");

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

    cameFromMosaicList = false;
    if (backSendBtn) backSendBtn.textContent = "← トークン選択へ戻る";
    showPage(transferPage);
  });

  // ============================
  // 保有トークン一覧から直接送金画面へ
  // ============================
  document.getElementById("mosaic-list")?.addEventListener("click", e => {
    const item = e.target.closest(".mosaic-item");
    if (!item) return;

    // 選択情報(selected-mosaic-id / name / balance)は
    // account.js 側の item.onclick で既にセット済み
    cameFromMosaicList = true;
    if (backSendBtn) backSendBtn.textContent = "← 戻る";
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
    qr.innerHTML = "読み込み中...";

    try {
      if (!appState.generationHash || !appState.networkType) {
        throw new Error("ネットワーク情報が未取得です");
      }

      // 他のSymbolウォレット(公式モバイルウォレット等)が読み込める
      // 形式(symbol-qr-library の AddressQR)でQRコードを生成する
      const addressQR = QRCodeGenerator.createExportAddress(
        "Symbol Simple Wallet",
        address,
        appState.networkType,
        appState.generationHash
      );

      const dataUrl = await firstValueFrom(addressQR.toBase64());
      qr.innerHTML = `<img src="${dataUrl}" alt="QR Code">`;
    } catch (e) {
      console.error("AddressQR生成失敗、通常QRにフォールバック", e);
      const dataUrl = await QRCode.toDataURL(address, {
        width: 220,
        margin: 1
      });
      qr.innerHTML = `<img src="${dataUrl}" alt="QR Code">`;
    }
  });

  // ============================
  // 受け取りアドレスコピー
  // ============================
  document.getElementById("copy-receive-address")?.addEventListener("click", () => {
    navigator.clipboard.writeText(appState.currentAddress.toString());
    showPopup("アドレスをコピーしました");
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
    await loadHarvestHistory();
  });

  // ============================
  // ハーベスト開始
  // ============================
  document.getElementById("start-harvest-btn")?.addEventListener("click", startHarvest);
  document.getElementById("stop-harvest-btn")?.addEventListener("click", stopHarvest);

  // ============================
  // 高度機能
  // ============================
  document.getElementById("advanced-btn")?.addEventListener("click", () => {
    showPage(advancedPage);
  });

  document.getElementById("menu-namespace")?.addEventListener("click", async () => {
    showPage(namespacePage);
    await loadOwnedNamespaces();
    await populateParentNamespaceSelect();
  });

  document.getElementById("menu-mosaic")?.addEventListener("click", async () => {
    showPage(mosaicPage);
    await loadOwnedMosaicsWithAlias();
    await populateMosaicNamespaceSelect();
  });

  // ============================
  // メタデータ
  // ============================
  document.getElementById("menu-metadata")?.addEventListener("click", async () => {
    showPage(metadataPage);
    await loadOwnMetadataList();
  });

  const metadataTargetType = document.getElementById("metadata-target-type");
  const metadataNamespaceRow = document.getElementById("metadata-target-namespace-row");
  const metadataMosaicRow = document.getElementById("metadata-target-mosaic-row");

  async function refreshMetadataTargetRows() {
    const type = metadataTargetType.value;
    metadataNamespaceRow.style.display = type === "namespace" ? "block" : "none";
    metadataMosaicRow.style.display = type === "mosaic" ? "block" : "none";

    if (type === "namespace") {
      const select = document.getElementById("metadata-target-namespace-select");
      select.innerHTML = `<option value="">-- 読み込み中... --</option>`;
      try {
        const options = await fetchOwnedNamespaceOptions();
        select.innerHTML = options.length
          ? options.map(ns => `<option value="${ns.id}">${ns.name}</option>`).join("")
          : `<option value="">-- 保有ネームスペースがありません --</option>`;
      } catch {
        select.innerHTML = `<option value="">-- 取得に失敗しました --</option>`;
      }
    } else if (type === "mosaic") {
      const select = document.getElementById("metadata-target-mosaic-select");
      select.innerHTML = `<option value="">-- 読み込み中... --</option>`;
      try {
        const ids = await fetchOwnedMosaicIds();
        select.innerHTML = ids.length
          ? ids.map(id => `<option value="${id}">${id}</option>`).join("")
          : `<option value="">-- 作成したモザイクがありません --</option>`;
      } catch {
        select.innerHTML = `<option value="">-- 取得に失敗しました --</option>`;
      }
    }
  }

  metadataTargetType?.addEventListener("change", refreshMetadataTargetRows);

  document.getElementById("submit-metadata-btn")?.addEventListener("click", async () => {
    const type = metadataTargetType.value;
    const key = document.getElementById("metadata-key-input").value.trim();
    const value = document.getElementById("metadata-value-input").value;

    if (!key) {
      setStatus("metadata-status", "メタデータキーを入力してください。", "error");
      return;
    }

    let targetId = null;
    if (type === "namespace") {
      targetId = document.getElementById("metadata-target-namespace-select").value;
      if (!targetId) {
        setStatus("metadata-status", "対象のネームスペースを選択してください。", "error");
        return;
      }
    } else if (type === "mosaic") {
      targetId = document.getElementById("metadata-target-mosaic-select").value;
      if (!targetId) {
        setStatus("metadata-status", "対象のモザイクを選択してください。", "error");
        return;
      }
    }

    setStatus("metadata-status", "登録・更新中...");
    try {
      const hash = await setMetadata(type, targetId, key, value);
      setStatus("metadata-status", `✅ リクエストを送信しました。Hash: ${hash}`, "success");
      await loadOwnMetadataList();
    } catch (e) {
      console.error("setMetadata error:", e);
      setStatus("metadata-status", e.message || "登録・更新に失敗しました。", "error");
    }
  });

  // ============================
  // マルチシグ
  // ============================
  document.getElementById("menu-multisig")?.addEventListener("click", () => {
    showPage(multisigMenuPage);
  });

  document.getElementById("menu-multisig-settings")?.addEventListener("click", async () => {
    showPage(multisigSettingsPage);
    await loadMultisigInfo();
  });

  document.getElementById("menu-multisig-send")?.addEventListener("click", async () => {
    showPage(multisigSendPage);
    const select = document.getElementById("multisig-send-from-select");
    select.innerHTML = `<option value="">-- 読み込み中... --</option>`;
    try {
      const addresses = await fetchCosignatoryOfAddresses();
      select.innerHTML = addresses.length
        ? addresses.map(a => `<option value="${a}">${a}</option>`).join("")
        : `<option value="">-- 連署者になっているマルチシグアカウントがありません --</option>`;
    } catch (e) {
      console.error("fetchCosignatoryOfAddresses error:", e);
      select.innerHTML = `<option value="">-- 取得に失敗しました --</option>`;
    }
  });

  document.getElementById("menu-multisig-sign")?.addEventListener("click", async () => {
    showPage(multisigSignPage);
    await loadPendingPartialTransactions();
  });

  document.getElementById("submit-multisig-settings-btn")?.addEventListener("click", async () => {
    const additionAddresses = document
      .getElementById("multisig-add-addresses").value
      .split("\n").map(s => s.trim()).filter(Boolean);
    const deletionAddresses = document
      .getElementById("multisig-remove-addresses").value
      .split("\n").map(s => s.trim()).filter(Boolean);
    const minApprovalDelta = parseInt(document.getElementById("multisig-min-approval-delta").value, 10) || 0;
    const minRemovalDelta = parseInt(document.getElementById("multisig-min-removal-delta").value, 10) || 0;

    if (additionAddresses.length === 0 && deletionAddresses.length === 0 && minApprovalDelta === 0 && minRemovalDelta === 0) {
      setStatus("multisig-settings-status", "変更内容を入力してください。", "error");
      return;
    }

    setStatus("multisig-settings-status", "提案中...（ハッシュロックの承認待ちを含むため数十秒かかります）");
    try {
      const hash = await updateMultisigSettings({
        minApprovalDelta,
        minRemovalDelta,
        additionAddresses,
        deletionAddresses,
      });
      setStatus(
        "multisig-settings-status",
        `✅ 提案を送信しました。Hash: ${hash}\n追加した連署者は、それぞれ「マルチシグ署名」から承認してください。`,
        "success"
      );
      document.getElementById("multisig-add-addresses").value = "";
      document.getElementById("multisig-remove-addresses").value = "";
    } catch (e) {
      console.error("updateMultisigSettings error:", e);
      setStatus("multisig-settings-status", e.message || "提案に失敗しました。", "error");
    }
  });

  document.getElementById("submit-multisig-send-btn")?.addEventListener("click", async () => {
    const multisigAddress = document.getElementById("multisig-send-from-select").value;
    const recipientAddress = document.getElementById("multisig-send-recipient").value.trim();
    const amountXym = parseFloat(document.getElementById("multisig-send-amount").value) || 0;
    const message = document.getElementById("multisig-send-message").value;

    if (!multisigAddress) {
      setStatus("multisig-send-status", "送金元マルチシグアカウントを選択してください。", "error");
      return;
    }
    if (!recipientAddress) {
      setStatus("multisig-send-status", "宛先アドレスを入力してください。", "error");
      return;
    }

    setStatus("multisig-send-status", "提案中...（ハッシュロックの承認待ちを含むため数十秒かかります）");
    try {
      const hash = await sendFromMultisig({ multisigAddress, recipientAddress, amountXym, message });
      setStatus(
        "multisig-send-status",
        `✅ 送金を提案しました。Hash: ${hash}\n必要な承認数に応じて、他の連署者が「マルチシグ署名」から承認する必要があります。`,
        "success"
      );
    } catch (e) {
      console.error("sendFromMultisig error:", e);
      setStatus("multisig-send-status", e.message || "提案に失敗しました。", "error");
    }
  });

  document.getElementById("multisig-pending-list")?.addEventListener("click", async e => {
    const btn = e.target.closest('[data-action="cosign"]');
    if (!btn) return;

    const hash = btn.dataset.hash;
    btn.disabled = true;
    btn.textContent = "署名中...";
    try {
      await cosignPending(hash);
      alert("✅ 連署を送信しました。");
      await loadPendingPartialTransactions();
    } catch (e) {
      console.error("cosignPending error:", e);
      alert(e.message || "連署に失敗しました。");
      btn.disabled = false;
      btn.textContent = "署名する";
    }
  });

  // ============================
  // 複数送信
  // ============================
  function renderMultisendRow(data = { address: "", mosaic: "", amount: "", message: "" }) {
    const container = document.getElementById("multisend-rows");
    const row = document.createElement("div");
    row.className = "multisend-row";
    row.innerHTML = `
      <input class="input-box ms-address" placeholder="送金先アドレス" value="${data.address}">
      <input class="input-box ms-mosaic" placeholder="mosaic (例: symbol.xym)" value="${data.mosaic}">
      <input class="input-box ms-amount" type="number" min="0" step="any" placeholder="数量" value="${data.amount}">
      <input class="input-box ms-message" placeholder="メッセージ" value="${data.message}">
      <button class="account-hide-btn" data-action="remove-row">削除</button>
    `;
    container.appendChild(row);
  }

  function clearMultisendRows() {
    document.getElementById("multisend-rows").innerHTML = "";
  }

  function readMultisendRows() {
    return Array.from(document.querySelectorAll(".multisend-row")).map(row => ({
      address: row.querySelector(".ms-address").value,
      mosaic: row.querySelector(".ms-mosaic").value,
      amount: row.querySelector(".ms-amount").value,
      message: row.querySelector(".ms-message").value,
    }));
  }

  document.getElementById("menu-multisend")?.addEventListener("click", () => {
    showPage(multisendMenuPage);
  });

  document.getElementById("menu-multisend-manual")?.addEventListener("click", () => {
    clearMultisendRows();
    renderMultisendRow();
    setStatus("multisend-status", "", "default");
    showPage(multisendListPage);
  });

  document.getElementById("menu-multisend-csv")?.addEventListener("click", () => {
    document.getElementById("multisend-csv-file").value = "";
    setStatus("multisend-csv-status", "", "default");
    showPage(multisendCsvPage);
  });

  document.getElementById("multisend-csv-file")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length === 0) {
        setStatus("multisend-csv-status", "CSVから送金先を読み取れませんでした。", "error");
        return;
      }

      clearMultisendRows();
      rows.forEach(r => renderMultisendRow(r));
      setStatus("multisend-status", `CSVから${rows.length}件読み込みました。内容を確認してください。`, "success");
      showPage(multisendListPage);
    } catch (err) {
      console.error("CSV parse error:", err);
      setStatus("multisend-csv-status", "CSVの読み込みに失敗しました。", "error");
    }
  });

  document.getElementById("multisend-add-row-btn")?.addEventListener("click", () => {
    if (document.querySelectorAll(".multisend-row").length >= 100) {
      alert("登録できる送金先は最大100件です。");
      return;
    }
    renderMultisendRow();
  });

  document.getElementById("multisend-rows")?.addEventListener("click", e => {
    const btn = e.target.closest('[data-action="remove-row"]');
    if (!btn) return;
    btn.closest(".multisend-row")?.remove();
  });

  document.getElementById("multisend-submit-btn")?.addEventListener("click", async () => {
    const rows = readMultisendRows();

    if (rows.length === 0) {
      setStatus("multisend-status", "送金先を1件以上入力してください。", "error");
      return;
    }

    if (!confirm(`${rows.length}件の送金を1つのトランザクションとして送信します。よろしいですか？`)) return;

    setStatus("multisend-status", "送信中...");
    try {
      const hash = await sendMultiTransfer(rows);
      setStatus("multisend-status", `✅ 送信しました。Hash: ${hash}`, "success");
    } catch (e) {
      console.error("sendMultiTransfer error:", e);
      setStatus("multisend-status", e.message || "送信に失敗しました。", "error");
    }
  });

  // ============================
  // アポスティーユ
  // ============================
  document.getElementById("menu-apostille")?.addEventListener("click", () => {
    showPage(apostilleMenuPage);
  });

  document.getElementById("menu-apostille-create")?.addEventListener("click", () => {
    document.getElementById("apostille-create-file").value = "";
    document.getElementById("apostille-create-hash").textContent = "";
    document.getElementById("apostille-owner-address").value = "";
    document.getElementById("apostille-metadata-key").value = "";
    document.getElementById("apostille-metadata-value").value = "";
    setStatus("apostille-create-status", "", "default");
    showPage(apostilleCreatePage);
  });

  document.getElementById("menu-apostille-verify")?.addEventListener("click", () => {
    document.getElementById("apostille-verify-file").value = "";
    document.getElementById("apostille-verify-hash").textContent = "";
    document.getElementById("apostille-verify-result").innerHTML = "";
    setStatus("apostille-verify-status", "", "default");
    showPage(apostilleVerifyPage);
  });

  document.getElementById("menu-apostille-history")?.addEventListener("click", () => {
    document.getElementById("apostille-history-file").value = "";
    document.getElementById("apostille-history-hash").textContent = "";
    document.getElementById("apostille-history-list").innerHTML = "";
    setStatus("apostille-history-status", "", "default");
    showPage(apostilleHistoryPage);
  });

  let apostilleCreateHash = null;
  document.getElementById("apostille-create-file")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById("apostille-create-hash").textContent = "ハッシュ計算中...";
    apostilleCreateHash = await computeFileHash(file);
    document.getElementById("apostille-create-hash").textContent = `SHA-256: ${apostilleCreateHash}`;
  });

  document.getElementById("apostille-create-btn")?.addEventListener("click", async () => {
    const file = document.getElementById("apostille-create-file").files?.[0];
    if (!file || !apostilleCreateHash) {
      setStatus("apostille-create-status", "ファイルを選択してください。", "error");
      return;
    }

    const ownerAddress = document.getElementById("apostille-owner-address").value.trim();
    const metadataKey = document.getElementById("apostille-metadata-key").value.trim();
    const metadataValue = document.getElementById("apostille-metadata-value").value.trim();

    setStatus("apostille-create-status", "作成中...");
    try {
      const hash = await createApostille({
        file,
        fileHashHex: apostilleCreateHash,
        ownerAddress,
        metadataKey,
        metadataValue,
      });
      setStatus("apostille-create-status", `✅ 作成しました。Hash: ${hash}`, "success");
    } catch (e) {
      console.error("createApostille error:", e);
      setStatus("apostille-create-status", e.message || "作成に失敗しました。", "error");
    }
  });

  let apostilleVerifyHash = null;
  document.getElementById("apostille-verify-file")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById("apostille-verify-hash").textContent = "ハッシュ計算中...";
    apostilleVerifyHash = await computeFileHash(file);
    document.getElementById("apostille-verify-hash").textContent = `SHA-256: ${apostilleVerifyHash}`;
  });

  document.getElementById("apostille-verify-btn")?.addEventListener("click", async () => {
    if (!apostilleVerifyHash) {
      setStatus("apostille-verify-status", "ファイルを選択してください。", "error");
      return;
    }

    const address = document.getElementById("apostille-verify-address").value.trim();
    const resultEl = document.getElementById("apostille-verify-result");
    resultEl.innerHTML = "";

    setStatus("apostille-verify-status", "検索中...");
    try {
      const matches = await searchApostilleTransactions(apostilleVerifyHash, address);
      if (matches.length === 0) {
        setStatus("apostille-verify-status", "❌ 一致する証明が見つかりませんでした（直近の取引のみ検索対象です）。", "error");
        return;
      }

      setStatus("apostille-verify-status", `✅ ${matches.length}件の証明が見つかりました。`, "success");
      resultEl.innerHTML = matches
        .map(m => `
          <div class="harvest-history-item">
            <div>Hash: ${m.hash}</div>
            <div>高さ: ${m.height}</div>
            <div>ファイル名: ${m.cert.fileName || "---"}</div>
            <div>所有者: ${m.cert.owner}</div>
            <div>記録日時(証明書内): ${m.cert.timestamp}</div>
          </div>
        `)
        .join("");
    } catch (e) {
      console.error("searchApostilleTransactions error:", e);
      setStatus("apostille-verify-status", "検索に失敗しました。", "error");
    }
  });

  let apostilleHistoryHash = null;
  document.getElementById("apostille-history-file")?.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    document.getElementById("apostille-history-hash").textContent = "ハッシュ計算中...";
    apostilleHistoryHash = await computeFileHash(file);
    document.getElementById("apostille-history-hash").textContent = `SHA-256: ${apostilleHistoryHash}`;
  });

  document.getElementById("apostille-history-btn")?.addEventListener("click", async () => {
    if (!apostilleHistoryHash) {
      setStatus("apostille-history-status", "ファイルを選択してください。", "error");
      return;
    }

    const address = document.getElementById("apostille-history-address").value.trim();
    const listEl = document.getElementById("apostille-history-list");
    listEl.innerHTML = "";

    setStatus("apostille-history-status", "検索中...");
    try {
      const matches = await searchApostilleTransactions(apostilleHistoryHash, address);
      if (matches.length === 0) {
        setStatus("apostille-history-status", "この証明の履歴は見つかりませんでした（直近の取引のみ検索対象です）。", "error");
        return;
      }

      setStatus("apostille-history-status", `${matches.length}件の履歴が見つかりました（古い順）。`, "success");
      listEl.innerHTML = matches
        .map((m, i) => `
          <div class="harvest-history-item">
            <div>#${i + 1}</div>
            <div>Hash: ${m.hash}</div>
            <div>高さ: ${m.height}</div>
            <div>所有者: ${m.cert.owner}</div>
            <div>記録日時(証明書内): ${m.cert.timestamp}</div>
          </div>
        `)
        .join("");
    } catch (e) {
      console.error("searchApostilleTransactions error(history):", e);
      setStatus("apostille-history-status", "検索に失敗しました。", "error");
    }
  });

  // ============================
  // 制限機能
  // ============================
  function populateOperationSelects() {
    const addSelect = document.getElementById("restriction-operation-add");
    const removeSelect = document.getElementById("restriction-operation-remove");
    const optionsHtml = OPERATION_TYPE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
    addSelect.innerHTML = optionsHtml;
    removeSelect.innerHTML = optionsHtml;
  }

  function readSelectedOptions(selectId) {
    return Array.from(document.getElementById(selectId).selectedOptions).map(o => o.value);
  }

  document.getElementById("menu-restriction")?.addEventListener("click", () => {
    showPage(restrictionMenuPage);
  });

  document.getElementById("menu-restriction-address")?.addEventListener("click", async () => {
    showPage(restrictionAddressPage);
    await loadAccountRestrictions("restriction-current-address", "address");
  });

  document.getElementById("menu-restriction-mosaic")?.addEventListener("click", async () => {
    showPage(restrictionMosaicPage);
    await loadAccountRestrictions("restriction-current-mosaic", "mosaic");
  });

  document.getElementById("menu-restriction-operation")?.addEventListener("click", async () => {
    populateOperationSelects();
    showPage(restrictionOperationPage);
    await loadAccountRestrictions("restriction-current-operation", "operation");
  });

  document.getElementById("restriction-address-submit")?.addEventListener("click", async () => {
    const block = document.getElementById("restriction-address-block").checked;
    const outgoing = document.getElementById("restriction-address-outgoing").checked;
    const additions = document.getElementById("restriction-address-add").value.split("\n").map(s => s.trim()).filter(Boolean);
    const deletions = document.getElementById("restriction-address-remove").value.split("\n").map(s => s.trim()).filter(Boolean);

    if (additions.length === 0 && deletions.length === 0) {
      setStatus("restriction-address-status", "追加または削除するアドレスを入力してください。", "error");
      return;
    }

    setStatus("restriction-address-status", "設定中...");
    try {
      const hash = await setAddressRestriction({ block, outgoing, additions, deletions });
      setStatus("restriction-address-status", `✅ 設定しました。Hash: ${hash}`, "success");
      document.getElementById("restriction-address-add").value = "";
      document.getElementById("restriction-address-remove").value = "";
      await loadAccountRestrictions("restriction-current-address", "address");
    } catch (e) {
      console.error("setAddressRestriction error:", e);
      setStatus("restriction-address-status", e.message || "設定に失敗しました。", "error");
    }
  });

  document.getElementById("restriction-mosaic-submit")?.addEventListener("click", async () => {
    const block = document.getElementById("restriction-mosaic-block").checked;
    const outgoing = document.getElementById("restriction-mosaic-outgoing").checked;
    const additions = document.getElementById("restriction-mosaic-add").value.split("\n").map(s => s.trim()).filter(Boolean);
    const deletions = document.getElementById("restriction-mosaic-remove").value.split("\n").map(s => s.trim()).filter(Boolean);

    if (additions.length === 0 && deletions.length === 0) {
      setStatus("restriction-mosaic-status", "追加または削除するモザイクIDを入力してください。", "error");
      return;
    }

    setStatus("restriction-mosaic-status", "設定中...");
    try {
      const hash = await setMosaicRestriction({ block, outgoing, additions, deletions });
      setStatus("restriction-mosaic-status", `✅ 設定しました。Hash: ${hash}`, "success");
      document.getElementById("restriction-mosaic-add").value = "";
      document.getElementById("restriction-mosaic-remove").value = "";
      await loadAccountRestrictions("restriction-current-mosaic", "mosaic");
    } catch (e) {
      console.error("setMosaicRestriction error:", e);
      setStatus("restriction-mosaic-status", e.message || "設定に失敗しました。", "error");
    }
  });

  document.getElementById("restriction-operation-submit")?.addEventListener("click", async () => {
    const block = document.getElementById("restriction-operation-block").checked;
    const additions = readSelectedOptions("restriction-operation-add");
    const deletions = readSelectedOptions("restriction-operation-remove");

    if (additions.length === 0 && deletions.length === 0) {
      setStatus("restriction-operation-status", "追加または削除する種類を選択してください。", "error");
      return;
    }

    setStatus("restriction-operation-status", "設定中...");
    try {
      const hash = await setOperationRestriction({ block, outgoing: true, additions, deletions });
      setStatus("restriction-operation-status", `✅ 設定しました。Hash: ${hash}`, "success");
      await loadAccountRestrictions("restriction-current-operation", "operation");
    } catch (e) {
      console.error("setOperationRestriction error:", e);
      setStatus("restriction-operation-status", e.message || "設定に失敗しました。", "error");
    }
  });

  document.getElementById("register-root-namespace-btn")?.addEventListener("click", async () => {
    const name = document.getElementById("root-namespace-name").value.trim();
    const duration = parseInt(document.getElementById("root-namespace-duration").value, 10);

    if (!name) {
      setStatus("root-namespace-status", "ネームスペース名を入力してください。", "error");
      return;
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      setStatus("root-namespace-status", "有効期間(ブロック数)を正しく入力してください。", "error");
      return;
    }

    setStatus("root-namespace-status", "登録中...");
    try {
      const hash = await registerRootNamespace(name, duration);
      setStatus("root-namespace-status", `✅ 登録リクエストを送信しました。Hash: ${hash}`, "success");
      document.getElementById("root-namespace-name").value = "";
      document.getElementById("root-namespace-duration").value = "";
      await loadOwnedNamespaces();
      await populateParentNamespaceSelect();
    } catch (e) {
      console.error("registerRootNamespace error:", e);
      setStatus("root-namespace-status", e.message || "登録に失敗しました。", "error");
    }
  });

  document.getElementById("register-child-namespace-btn")?.addEventListener("click", async () => {
    const parentId = document.getElementById("child-namespace-parent-select").value;
    const childName = document.getElementById("child-namespace-name").value.trim();

    if (!parentId) {
      setStatus("child-namespace-status", "親ネームスペースを選択してください。", "error");
      return;
    }
    if (!childName) {
      setStatus("child-namespace-status", "子ネームスペース名を入力してください。", "error");
      return;
    }

    setStatus("child-namespace-status", "登録中...");
    try {
      const hash = await registerChildNamespace(parentId, childName);
      setStatus("child-namespace-status", `✅ 登録リクエストを送信しました。Hash: ${hash}`, "success");
      document.getElementById("child-namespace-name").value = "";
      await loadOwnedNamespaces();
      await populateParentNamespaceSelect();
    } catch (e) {
      console.error("registerChildNamespace error:", e);
      setStatus("child-namespace-status", e.message || "登録に失敗しました。", "error");
    }
  });

  document.getElementById("owned-mosaic-list")?.addEventListener("click", async e => {
    const btn = e.target.closest('[data-action="link-mosaic"]');
    if (!btn) return;

    const mosaicId = btn.dataset.mosaicId;
    const select = document.querySelector(`.mosaic-link-select[data-mosaic-id="${mosaicId}"]`);
    const namespaceId = select?.value;

    if (!namespaceId) {
      alert("ネームスペースを選択してください。");
      return;
    }

    btn.disabled = true;
    btn.textContent = "リンク中...";
    try {
      await linkNamespaceToMosaic(mosaicId, namespaceId);
      alert("✅ リンクリクエストを送信しました。");
      await loadOwnedMosaicsWithAlias();
    } catch (e) {
      console.error("linkNamespaceToMosaic error:", e);
      alert(e.message || "リンクに失敗しました。");
      btn.disabled = false;
      btn.textContent = "リンクする";
    }
  });

  document.getElementById("create-mosaic-btn")?.addEventListener("click", async () => {
    const divisibility = parseInt(document.getElementById("mosaic-divisibility").value, 10) || 0;
    const durationBlocks = parseInt(document.getElementById("mosaic-duration").value, 10) || 0;
    const initialSupply = parseFloat(document.getElementById("mosaic-initial-supply").value) || 0;
    const transferable = document.getElementById("mosaic-transferable").checked;
    const supplyMutable = document.getElementById("mosaic-supply-mutable").checked;
    const restrictable = document.getElementById("mosaic-restrictable").checked;
    const linkNamespaceIdHex = document.getElementById("mosaic-link-namespace-select").value || null;

    setStatus("mosaic-create-status", "作成中...");
    try {
      const hash = await createMosaic({
        divisibility,
        durationBlocks,
        supplyMutable,
        transferable,
        restrictable,
        initialSupply,
        linkNamespaceIdHex,
      });
      setStatus("mosaic-create-status", `✅ 作成リクエストを送信しました。Hash: ${hash}`, "success");
      await loadOwnedMosaicsWithAlias();
    } catch (e) {
      console.error("createMosaic error:", e);
      setStatus("mosaic-create-status", e.message || "作成に失敗しました。", "error");
    }
  });

  // ============================
  // 設定メニュー
  // ============================
  document.getElementById("settings-btn")?.addEventListener("click", () => {
    const isSss = appState.authMode === "sss";
    const mnemonicAddItem = document.getElementById("menu-add-mnemonic");
    const privatekeyAddItem = document.getElementById("menu-add-privatekey");
    if (mnemonicAddItem) mnemonicAddItem.style.display = isSss ? "none" : "";
    if (privatekeyAddItem) privatekeyAddItem.style.display = isSss ? "none" : "";
    showPage(settingsPage);
  });

  document.getElementById("menu-node-settings")?.addEventListener("click", async () => {
    showPage(nodeSettingsPage);
    showCurrentNode();
    await loadNodeSettingsCandidates();
  });

  document.getElementById("menu-fee-settings")?.addEventListener("click", async () => {
    showPage(feeSettingsPage);
    await loadFeeSettings();
  });

  document.getElementById("apply-node-btn")?.addEventListener("click", applyNodeChange);

  document.getElementById("fee-options")?.addEventListener("click", e => {
    const option = e.target.closest(".fee-option");
    if (!option) return;
    selectFeeOption(option);
  });

  document.getElementById("apply-fee-btn")?.addEventListener("click", applyFeeSettings);

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    if (!confirm("ログアウトします。次回は再度ニーモニックの入力（またはSSS Extension接続）が必要になります。よろしいですか？")) return;
    logout();
    showPage(welcomePage);
  });

  // ============================
  // アカウント切替(▼マーク)
  // ============================
  document.getElementById("account-switch-btn")?.addEventListener("click", () => {
    renderAccountSwitcherList();
    showPage(accountSwitcherPage);
  });

  document.getElementById("account-switcher-list")?.addEventListener("click", async e => {
    const hideBtn = e.target.closest('[data-action="hide"]');
    if (hideBtn) {
      const id = hideBtn.dataset.id;
      await setAccountHidden(id, true);
      renderAccountSwitcherList();
      return;
    }

    const row = e.target.closest('[data-action="switch"]');
    if (row) {
      const id = row.dataset.id;
      if (id === appState.activeAccountId) return;
      try {
        await switchToAccount(id);
        updateSwitcherVisibility();
        goHome();
      } catch (err) {
        console.error("switchToAccount error:", err);
        alert(err.message || "アカウントの切替に失敗しました。");
      }
    }
  });

  document.getElementById("add-account-btn")?.addEventListener("click", async () => {
    if (hasCurrentMnemonic()) {
      try {
        await addNextAccountFromCurrentMnemonic();
        updateSwitcherVisibility();
        renderAccountSwitcherList();
        showPage(accountSwitcherPage);
      } catch (e) {
        console.error("addNextAccountFromCurrentMnemonic error:", e);
        alert(e.message || "アカウントの追加に失敗しました。");
      }
      return;
    }

    // ニーモニックがメモリ上にない場合(SSSのみ利用中など)は
    // 秘密鍵の直接入力で追加する
    showPage(addAccountPrivatekeyPage);
  });

  document.getElementById("manage-hidden-accounts-btn")?.addEventListener("click", () => {
    renderHiddenAccountList();
    showPage(hiddenAccountsPage);
  });

  document.getElementById("hidden-account-list")?.addEventListener("click", async e => {
    const btn = e.target.closest('[data-action="unhide"]');
    if (!btn) return;
    await setAccountHidden(btn.dataset.id, false);
    renderHiddenAccountList();
  });

  // ============================
  // アカウント追加(設定・アカウント切替の両方から使う共通画面)
  // ============================
  document.getElementById("menu-add-mnemonic")?.addEventListener("click", () => {
    document.getElementById("add-mnemonic-index").value = nextMnemonicAccountIndex();
    showPage(addAccountMnemonicPage);
  });

  document.getElementById("menu-add-privatekey")?.addEventListener("click", () => {
    showPage(addAccountPrivatekeyPage);
  });

  document.getElementById("add-account-mnemonic-choice")?.addEventListener("click", () => {
    document.getElementById("add-mnemonic-index").value = nextMnemonicAccountIndex();
    showPage(addAccountMnemonicPage);
  });

  document.getElementById("add-account-privatekey-choice")?.addEventListener("click", () => {
    showPage(addAccountPrivatekeyPage);
  });

  document.getElementById("add-mnemonic-submit")?.addEventListener("click", async () => {
    const mnemonicPhrase = document.getElementById("add-mnemonic-input").value.trim();
    const accountIndex = parseInt(document.getElementById("add-mnemonic-index").value, 10) || 0;
    const label = document.getElementById("add-mnemonic-label").value;

    if (!mnemonicPhrase) {
      setStatus("add-mnemonic-status", "ニーモニックを入力してください。", "error");
      return;
    }

    setStatus("add-mnemonic-status", "追加中...");
    try {
      await addAccountFromMnemonic(mnemonicPhrase, accountIndex, label);
      document.getElementById("add-mnemonic-input").value = "";
      document.getElementById("add-mnemonic-label").value = "";
      updateSwitcherVisibility();
      goHome();
    } catch (e) {
      console.error("addAccountFromMnemonic error:", e);
      setStatus("add-mnemonic-status", e.message || "追加に失敗しました。", "error");
    }
  });

  document.getElementById("add-privatekey-submit")?.addEventListener("click", async () => {
    const privateKeyHex = document.getElementById("add-privatekey-input").value.trim();
    const label = document.getElementById("add-privatekey-label").value;

    if (!privateKeyHex) {
      setStatus("add-privatekey-status", "秘密鍵を入力してください。", "error");
      return;
    }

    setStatus("add-privatekey-status", "追加中...");
    try {
      await addAccountFromPrivateKey(privateKeyHex, label);
      document.getElementById("add-privatekey-input").value = "";
      document.getElementById("add-privatekey-label").value = "";
      updateSwitcherVisibility();
      goHome();
    } catch (e) {
      console.error("addAccountFromPrivateKey error:", e);
      setStatus("add-privatekey-status", e.message || "追加に失敗しました。", "error");
    }
  });

  // ============================
  // 戻る
  // ============================
  document.getElementById("back-account")?.addEventListener("click", () => showPage(accountPage));
  backSendBtn?.addEventListener("click", () => {
    showPage(cameFromMosaicList ? accountPage : sendPage);
  });
  document.getElementById("back-account-receive")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-harvest")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-settings")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-settings-node")?.addEventListener("click", () => showPage(settingsPage));
  document.getElementById("back-settings-fee")?.addEventListener("click", () => showPage(settingsPage));
  document.getElementById("back-account-switcher")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-hidden-accounts")?.addEventListener("click", () => showPage(accountSwitcherPage));
  document.getElementById("back-add-account-menu")?.addEventListener("click", () => showPage(accountSwitcherPage));
  document.getElementById("back-add-account-mnemonic")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-add-account-privatekey")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-advanced")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-advanced-namespace")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-advanced-mosaic")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-advanced-metadata")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-advanced-multisig-menu")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-multisig-menu-settings")?.addEventListener("click", () => showPage(multisigMenuPage));
  document.getElementById("back-multisig-menu-send")?.addEventListener("click", () => showPage(multisigMenuPage));
  document.getElementById("back-multisig-menu-sign")?.addEventListener("click", () => showPage(multisigMenuPage));
  document.getElementById("back-advanced-multisend-menu")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-multisend-menu-csv")?.addEventListener("click", () => showPage(multisendMenuPage));
  document.getElementById("back-multisend-menu-list")?.addEventListener("click", () => showPage(multisendMenuPage));
  document.getElementById("back-advanced-apostille-menu")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-apostille-menu-create")?.addEventListener("click", () => showPage(apostilleMenuPage));
  document.getElementById("back-apostille-menu-verify")?.addEventListener("click", () => showPage(apostilleMenuPage));
  document.getElementById("back-apostille-menu-history")?.addEventListener("click", () => showPage(apostilleMenuPage));
  document.getElementById("back-advanced-restriction-menu")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-restriction-menu-address")?.addEventListener("click", () => showPage(restrictionMenuPage));
  document.getElementById("back-restriction-menu-mosaic")?.addEventListener("click", () => showPage(restrictionMenuPage));
  document.getElementById("back-restriction-menu-operation")?.addEventListener("click", () => showPage(restrictionMenuPage));

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
