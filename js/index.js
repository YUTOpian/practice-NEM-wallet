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
} from "./settings.js";
import {
  loginWithMnemonic,
  hasVault,
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
  generateNewMnemonic,
  returnToLoginScreen,
  switchNetwork,
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
} from "./mosaic.js";
import {
  loadMultisigInfo,
  fetchCosignatoryOfAddresses,
  updateMultisigSettings,
  sendFromMultisig,
  loadPendingPartialTransactions,
  cosignPending,
} from "./multisig.js";
import QRCode from "https://esm.sh/qrcode";

window.addEventListener("load", async () => {
  // ============================
  // ページ取得
  // ============================
  const welcomePage = document.getElementById("welcome-page");
  const mnemonicImportPage = document.getElementById("mnemonic-import-page");
  const createNewPage = document.getElementById("create-new-page");
  const passwordSetupPage = document.getElementById("password-setup-page");
  const unlockPage = document.getElementById("unlock-page");
  const accountPage = document.getElementById("account-page");
  const sendPage = document.getElementById("send-page");
  const transferPage = document.getElementById("transfer-page");
  const receivePage = document.getElementById("receive-page");
  const harvestPage = document.getElementById("harvest-page");
  const settingsPage = document.getElementById("settings-page");
  const networkSettingsPage = document.getElementById("network-settings-page");
  const nodeSettingsPage = document.getElementById("node-settings-page");
  const accountSwitcherPage = document.getElementById("account-switcher-page");
  const hiddenAccountsPage = document.getElementById("hidden-accounts-page");
  const addAccountMnemonicPage = document.getElementById("add-account-mnemonic-page");
  const addAccountPrivatekeyPage = document.getElementById("add-account-privatekey-page");
  const advancedPage = document.getElementById("advanced-page");
  const namespacePage = document.getElementById("namespace-page");
  const mosaicPage = document.getElementById("mosaic-page");
  const multisigMenuPage = document.getElementById("multisig-menu-page");
  const multisigSettingsPage = document.getElementById("multisig-settings-page");
  const multisigSendPage = document.getElementById("multisig-send-page");
  const multisigSignPage = document.getElementById("multisig-sign-page");

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
  // パスワード設定は必須のため、保存済みアカウントがあれば
  // 必ずパスワード入力画面を表示する(自動ログインはしない)
  // ============================
  if (hasVault()) {
    showPage(unlockPage);
  } else {
    showPage(welcomePage);
  }

  // ============================
  // ニーモニックインポート画面へ / 新規作成画面へ
  // (ウェルカム画面はニーモニック関連の選択肢のみ。SSS Extensionは非対応)
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
      alert(e.message || "ノードに接続できません");
    }
  });

  // ============================
  // 新規作成画面
  // ============================
  let generatedMnemonicPhrase = null;

  document.getElementById("choose-create-new")?.addEventListener("click", () => {
    generatedMnemonicPhrase = null;
    document.getElementById("generated-mnemonic-area").style.display = "none";
    document.getElementById("generated-mnemonic-display").textContent = "";
    setStatus("create-new-status", "", "default");
    showPage(createNewPage);
  });

  document.getElementById("back-welcome-create-new")?.addEventListener("click", () => showPage(welcomePage));

  document.getElementById("generate-mnemonic-btn")?.addEventListener("click", async () => {
    setStatus("create-new-status", "生成中...");
    try {
      generatedMnemonicPhrase = await generateNewMnemonic();
      document.getElementById("generated-mnemonic-display").textContent = generatedMnemonicPhrase;
      document.getElementById("generated-mnemonic-area").style.display = "block";
      setStatus("create-new-status", "", "default");
    } catch (e) {
      console.error("generateNewMnemonic error:", e);
      setStatus("create-new-status", e.message || "生成に失敗しました。", "error");
    }
  });

  document.getElementById("create-new-next-btn")?.addEventListener("click", async () => {
    if (!generatedMnemonicPhrase) return;

    const recorded = confirm("記録しましたか？");
    if (!recorded) return;

    const networkChoice = document.getElementById("create-new-network-select").value;
    const networkType = networkChoice === "testnet" ? NetworkType.TESTNET : NetworkType.MAINNET;

    setStatus("create-new-status", "作成中...");
    try {
      await loginWithMnemonic(generatedMnemonicPhrase, networkType);
      generatedMnemonicPhrase = null;
      document.getElementById("generated-mnemonic-display").textContent = "";
      document.getElementById("generated-mnemonic-area").style.display = "none";
      setStatus("create-new-status", "", "default");
      showPage(passwordSetupPage);
    } catch (e) {
      console.error("loginWithMnemonic (create-new) error:", e);
      setStatus("create-new-status", e.message || "作成に失敗しました。", "error");
      alert(e.message || "ノードに接続できません");
    }
  });

  // ============================
  // パスワード設定(任意)
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

    // NEM(NIS1)公式ウォレット向けのQR仕様はSymbolの symbol-qr-library とは異なるため、
    // ここではシンプルにアドレス文字列そのもののQRコードを表示する。
    try {
      const dataUrl = await QRCode.toDataURL(address, { width: 220, margin: 1 });
      qr.innerHTML = `<img src="${dataUrl}" alt="QR Code">`;
    } catch (e) {
      console.error("QRコード生成失敗", e);
      qr.innerHTML = "QRコードの生成に失敗しました";
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

    if (additionAddresses.length === 0 && deletionAddresses.length === 0 && minApprovalDelta === 0) {
      setStatus("multisig-settings-status", "変更内容を入力してください。", "error");
      return;
    }

    setStatus("multisig-settings-status", "送信中...");
    try {
      const hash = await updateMultisigSettings({
        minApprovalDelta,
        additionAddresses,
        deletionAddresses,
      });
      setStatus("multisig-settings-status", `✅ 送信しました。Hash: ${hash}`, "success");
      document.getElementById("multisig-add-addresses").value = "";
      document.getElementById("multisig-remove-addresses").value = "";
    } catch (e) {
      console.error("updateMultisigSettings error:", e);
      setStatus("multisig-settings-status", e.message || "送信に失敗しました。", "error");
    }
  });

  document.getElementById("submit-multisig-send-btn")?.addEventListener("click", async () => {
    const multisigAddress = document.getElementById("multisig-send-from-select").value;
    const recipientAddress = document.getElementById("multisig-send-recipient").value.trim();
    const amountXem = parseFloat(document.getElementById("multisig-send-amount").value) || 0;
    const message = document.getElementById("multisig-send-message").value;

    if (!multisigAddress) {
      setStatus("multisig-send-status", "送金元マルチシグアカウントを選択してください。", "error");
      return;
    }
    if (!recipientAddress) {
      setStatus("multisig-send-status", "宛先アドレスを入力してください。", "error");
      return;
    }

    setStatus("multisig-send-status", "提案中...");
    try {
      const hash = await sendFromMultisig({ multisigAddress, recipientAddress, amountXem, message });
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
    const multisigAddress = btn.dataset.multisig;
    btn.disabled = true;
    btn.textContent = "署名中...";
    try {
      await cosignPending(hash, multisigAddress);
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
  // ネームスペース
  // ============================
  document.getElementById("register-root-namespace-btn")?.addEventListener("click", async () => {
    const name = document.getElementById("root-namespace-name").value.trim();

    if (!name) {
      setStatus("root-namespace-status", "ネームスペース名を入力してください。", "error");
      return;
    }

    setStatus("root-namespace-status", "登録中...");
    try {
      const hash = await registerRootNamespace(name);
      setStatus("root-namespace-status", `✅ 登録リクエストを送信しました。Hash: ${hash}`, "success");
      document.getElementById("root-namespace-name").value = "";
      await loadOwnedNamespaces();
      await populateParentNamespaceSelect();
    } catch (e) {
      console.error("registerRootNamespace error:", e);
      setStatus("root-namespace-status", e.message || "登録に失敗しました。", "error");
    }
  });

  document.getElementById("register-child-namespace-btn")?.addEventListener("click", async () => {
    const parentFqn = document.getElementById("child-namespace-parent-select").value;
    const childName = document.getElementById("child-namespace-name").value.trim();

    if (!parentFqn) {
      setStatus("child-namespace-status", "親ネームスペースを選択してください。", "error");
      return;
    }
    if (!childName) {
      setStatus("child-namespace-status", "子ネームスペース名を入力してください。", "error");
      return;
    }

    setStatus("child-namespace-status", "登録中...");
    try {
      const hash = await registerChildNamespace(parentFqn, childName);
      setStatus("child-namespace-status", `✅ 登録リクエストを送信しました。Hash: ${hash}`, "success");
      document.getElementById("child-namespace-name").value = "";
      await loadOwnedNamespaces();
      await populateParentNamespaceSelect();
    } catch (e) {
      console.error("registerChildNamespace error:", e);
      setStatus("child-namespace-status", e.message || "登録に失敗しました。", "error");
    }
  });

  // ============================
  // モザイク作成
  // ============================
  document.getElementById("create-mosaic-btn")?.addEventListener("click", async () => {
    const namespaceFqn = document.getElementById("mosaic-link-namespace-select").value;
    const mosaicName = document.getElementById("mosaic-name-input")?.value?.trim();
    const description = document.getElementById("mosaic-description-input")?.value?.trim() || "";
    const divisibility = parseInt(document.getElementById("mosaic-divisibility").value, 10) || 0;
    const initialSupply = parseFloat(document.getElementById("mosaic-initial-supply").value) || 0;
    const transferable = document.getElementById("mosaic-transferable").checked;
    const supplyMutable = document.getElementById("mosaic-supply-mutable").checked;

    if (!mosaicName) {
      setStatus("mosaic-create-status", "モザイク名を入力してください。", "error");
      return;
    }

    setStatus("mosaic-create-status", "作成中...");
    try {
      const hash = await createMosaic({
        namespaceFqn,
        mosaicName,
        description,
        divisibility,
        supplyMutable,
        transferable,
        initialSupply,
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
    showPage(settingsPage);
  });

  document.getElementById("menu-node-settings")?.addEventListener("click", async () => {
    showPage(nodeSettingsPage);
    showCurrentNode();
    await loadNodeSettingsCandidates();
  });

  document.getElementById("apply-node-btn")?.addEventListener("click", applyNodeChange);

  // ============================
  // ネットワーク切り替え
  // ============================
  document.getElementById("menu-network-settings")?.addEventListener("click", () => {
    const current = document.getElementById("network-settings-current");
    if (current) {
      current.textContent = appState.networkType === NetworkType.TESTNET ? "Testnet" : "Mainnet";
    }
    setStatus("network-settings-status", "", "default");
    showPage(networkSettingsPage);
  });

  document.getElementById("back-settings-network")?.addEventListener("click", () => showPage(settingsPage));

  async function handleSwitchNetwork(targetNetworkType) {
    setStatus("network-settings-status", "切り替え中...");
    try {
      const ok = await switchNetwork(targetNetworkType);
      if (!ok) {
        alert("ネットワーク切り替えができません");
        setStatus("network-settings-status", "", "default");
        return;
      }
      const current = document.getElementById("network-settings-current");
      if (current) {
        current.textContent = targetNetworkType === NetworkType.TESTNET ? "Testnet" : "Mainnet";
      }
      setStatus("network-settings-status", "✅ 切り替えました。", "success");
      goHome();
    } catch (e) {
      console.error("switchNetwork error:", e);
      alert("ネットワーク切り替えができません");
      setStatus("network-settings-status", "", "default");
    }
  }

  document.getElementById("switch-to-mainnet-btn")?.addEventListener("click", () => handleSwitchNetwork(NetworkType.MAINNET));
  document.getElementById("switch-to-testnet-btn")?.addEventListener("click", () => handleSwitchNetwork(NetworkType.TESTNET));

  // ============================
  // ログイン画面に戻る(データは削除しない)
  // ============================
  document.getElementById("back-to-login-btn")?.addEventListener("click", () => {
    if (!confirm("ログイン画面（パスワード入力画面）に戻ります。保存されたアカウント情報は削除されません。よろしいですか？")) return;
    returnToLoginScreen();
    // 「ログイン画面に戻る」＝パスワード入力画面に戻ること
    showPage(hasVault() ? unlockPage : welcomePage);
  });

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    if (!confirm("ログアウトします。次回は再度ニーモニックの入力が必要になります。よろしいですか？")) return;
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
  document.getElementById("back-account-switcher")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-hidden-accounts")?.addEventListener("click", () => showPage(accountSwitcherPage));
  document.getElementById("back-add-account-menu")?.addEventListener("click", () => showPage(accountSwitcherPage));
  document.getElementById("back-add-account-mnemonic")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-add-account-privatekey")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-advanced")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-advanced-namespace")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-advanced-mosaic")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-advanced-multisig-menu")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-multisig-menu-settings")?.addEventListener("click", () => showPage(multisigMenuPage));
  document.getElementById("back-multisig-menu-send")?.addEventListener("click", () => showPage(multisigMenuPage));
  document.getElementById("back-multisig-menu-sign")?.addEventListener("click", () => showPage(multisigMenuPage));

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
