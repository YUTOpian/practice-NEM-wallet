// harvest.js
// 委任ハーベスティング (Delegated / Remote Harvesting) — NEM(NIS1)版
//
// NEMの委任ハーベストはSymbolよりずっとシンプル:
//   ① ImportanceTransferTransaction(mode: ACTIVATE) で
//      「リモートアカウント」を1つ指定し、自分の重要度(importance)を委任する
//      (Symbolのような VRF鍵/ノード鍵リンクや PersistentDelegationRequest は不要)
//   ② 委任先ノードに対して、そのリモートアカウントの秘密鍵を
//      POST /account/unlock で伝え、そのノードにハーベストを代行してもらう
//      (ノードを自分で信頼する必要がある。悪意あるノードには渡さないこと)
//
// 解除は同トランザクションを mode: DEACTIVATE で送るだけ。
//
// ⚠️ ImportanceTransferTransactionディスクリプタの引数は
//   Symbol版実装のパターンから類推している。実行前に
//   `appState.sdkNem.descriptors` の内容を確認してください。

import { appState, NetworkType } from "./config.js";
import { fetchReachablePeers } from "./nodeSelector.js";
import { signAndAnnounceTx } from "./auth.js";

/* ============================================================
   委任先ノード候補の読み込み(現在接続中ノードのピア一覧から)
============================================================ */
export async function loadHarvestNodeCandidates() {
  const select = document.getElementById("harvest-node-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- 候補を読み込み中... --</option>`;

  try {
    const peers = await fetchReachablePeers(appState.NODE);

    if (peers.length === 0) {
      select.innerHTML = `<option value="">-- 候補が見つかりません(下に直接URLを入力してください) --</option>`;
      return;
    }

    select.innerHTML =
      `<option value="">-- ノードを選択（未選択なら接続中ノードを使用）--</option>` +
      peers.map((url) => `<option value="${url}">${url}</option>`).join("");
  } catch (e) {
    console.warn("ノード候補の取得に失敗しました", e);
    select.innerHTML = `<option value="">-- 候補の取得に失敗（下に直接URLを入力してください）--</option>`;
  }
}

function getSelectedHarvestNodeUrl() {
  const manual = document.getElementById("harvest-node-input")?.value?.trim();
  if (manual) return manual;

  const selected = document.getElementById("harvest-node-select")?.value?.trim();
  if (selected) return selected;

  return appState.NODE;
}

/* ============================================================
   直近生成したリモート鍵（セッション内のみ保持）
   委任解除の際に使う。リロードすると消えるため、画面にも控えてもらう。
============================================================ */
let lastRemoteKeys = null;

function toHex(bytesOrKey) {
  const bytes = bytesOrKey.bytes ?? bytesOrKey;
  return appState.sdkCore.utils.uint8ToHex(bytes);
}

/* ============================================================
   ハーベスト状態確認
============================================================ */
export async function checkHarvestStatus() {
  const statusEl = document.getElementById("harvest-status");
  const importanceEl = document.getElementById("harvest-importance");
  const badgeEl = document.getElementById("harvest-badge");
  if (!statusEl) return;

  const setBadge = (cls, text) => {
    if (!badgeEl) return;
    badgeEl.className = `harvest-badge ${cls}`;
    badgeEl.textContent = text;
  };

  try {
    statusEl.textContent = "状態確認中...";
    setBadge("", "確認中...");

    const address = appState.currentAddress.toString();
    const res = await fetch(`${appState.NODE}/account/get?address=${encodeURIComponent(address)}`);
    const json = await res.json();
    const account = json.account;
    const meta = json.meta;

    if (!account) {
      statusEl.textContent = "アカウント情報取得失敗";
      setBadge("inactive", "❌ アカウント未登録");
      return;
    }

    const importance = account.importance ?? 0;
    if (importanceEl) importanceEl.textContent = importance.toString();

    // remoteStatus: "ACTIVE"(委任中) / "ACTIVATING" / "INACTIVE" / "DEACTIVATING" / "REMOTE"(自分がリモート役)
    const remoteStatus = meta?.remoteStatus ?? "INACTIVE";

    if (remoteStatus === "ACTIVE") {
      setBadge("active", "✅ 委任ハーベスティング設定済み");
    } else if (remoteStatus === "ACTIVATING" || remoteStatus === "DEACTIVATING") {
      setBadge("partial", `⚠️ 反映待ち (${remoteStatus})`);
    } else {
      setBadge("inactive", "❌ 委任ハーベスティング未設定");
    }

    statusEl.textContent = `重要度: ${importance} / remoteStatus: ${remoteStatus} / harvestedBlocks: ${account.harvestedBlocks ?? 0}`;
  } catch (e) {
    console.error("Harvest status error:", e);
    statusEl.textContent = "状態取得エラー";
    setBadge("inactive", "❌ 状態取得エラー");
  }
}

/* ============================================================
   トランザクション確認待ち
   NIS1には /transactionStatus/{hash} のようなAPIが無いため、
   「未承認一覧から消えたら承認されたとみなす」簡易実装にしている。
============================================================ */
async function waitConfirmed(hash, address, { timeoutMs = 90000, intervalMs = 4000 } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(
        `${appState.NODE}/account/unconfirmedTransactions?address=${encodeURIComponent(address)}`
      );
      const json = await res.json();
      const items = json.data ?? [];
      const stillPending = items.some((item) => {
        const h = item.meta?.hash?.data ?? item.meta?.hash;
        return h === hash;
      });
      if (!stillPending) return true;
    } catch (e) {
      console.warn("waitConfirmed polling error:", e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("承認待ちがタイムアウトしました(ネットワーク混雑時はもう少しお待ちください)");
}

/* ============================================================
   ステーキング(ハーベスト)履歴
   NIS1: GET /account/harvests?address=
============================================================ */
export async function loadHarvestHistory() {
  const el = document.getElementById("harvest-history");
  if (!el) return;

  el.textContent = "読み込み中...";

  try {
    if (!appState.NODE || !appState.currentAddress) {
      throw new Error("アカウント未接続です");
    }

    const address = appState.currentAddress.toString();
    const res = await fetch(`${appState.NODE}/account/harvests?address=${encodeURIComponent(address)}`);
    const json = await res.json();
    const items = json.data ?? [];

    if (items.length === 0) {
      el.innerHTML = `<div>ハーベスト履歴はありません</div>`;
      return;
    }

    el.innerHTML = items
      .slice(0, 10)
      .map((h) => {
        const feeXem = h.totalFee
          ? (Number(h.totalFee) / 1_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 6 })
          : "0";

        return `
          <div class="harvest-history-item">
            <div>高さ: ${h.height}</div>
            <div>獲得手数料(概算): ${feeXem} XEM</div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error("loadHarvestHistory error:", e);
    el.textContent = "履歴取得エラー";
  }
}

/* ============================================================
   委任ハーベスティング開始
============================================================ */
export async function startHarvest() {
  const statusEl = document.getElementById("harvest-status");
  const setLine = (text) => {
    if (statusEl) statusEl.textContent = text;
    console.log("[harvest]", text);
  };

  try {
    if (!appState.facade || !appState.currentPubKey) {
      throw new Error("SDK未初期化またはアカウント未接続です");
    }

    const harvestNodeUrl = getSelectedHarvestNodeUrl();
    if (!harvestNodeUrl) {
      throw new Error("委任先ノードが指定されていません");
    }

    setLine("リモートアカウントの鍵を生成中...");
    const remotePrivateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const remotePrivateKey = new appState.sdkCore.PrivateKey(remotePrivateKeyBytes);
    const remoteKeyPair = new appState.facade.static.KeyPair(remotePrivateKey);

    lastRemoteKeys = {
      remotePrivateKey: toHex(remotePrivateKey),
      remotePublicKey: remoteKeyPair.publicKey.toString(),
    };
    console.warn(
      "生成したリモートアカウントの秘密鍵（この画面を閉じると失われます。解除の際に必要な場合があるため控えてください）:",
      lastRemoteKeys
    );

    const { descriptors, models } = appState.sdkNem;

    setLine("① ImportanceTransferTransaction(ACTIVATE)を署名しています...");
    const descriptor = new descriptors.ImportanceTransferTransactionV1Descriptor(
      models.ImportanceTransferMode.ACTIVATE,
      remoteKeyPair.publicKey
    );
    const tx = appState.facade.createTransactionFromTypedDescriptor(
      descriptor,
      appState.currentPubKey,
      appState.feeMultiplier ?? 1,
      60 * 60
    );

    const hash = await signAndAnnounceTx(tx);
    setLine(`委任Tx送信済み (${hash.slice(0, 12)}...) 承認待ち...`);

    const address = appState.currentAddress.toString();
    await waitConfirmed(hash, address);
    setLine("委任Tx承認完了。② ノードにリモート鍵をアンロック依頼します...");

    const unlockRes = await fetch(new URL("/account/unlock", harvestNodeUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privateKey: lastRemoteKeys.remotePrivateKey }),
    });

    if (!unlockRes.ok) {
      const errJson = await unlockRes.json().catch(() => ({}));
      throw new Error(
        `ノードへのアンロック依頼に失敗しました: ${errJson.message ?? unlockRes.status}`
      );
    }

    setLine("✅ 委任ハーベスティングの設定が完了しました");
    alert(
      "委任ハーベスティングの設定が完了しました。\n" +
      "ノードが受け付けていれば、まもなくハーベストが始まります。\n" +
      "（ノードを再起動するとアンロック状態が解除される場合があります）"
    );
    await checkHarvestStatus();
  } catch (e) {
    console.error("startHarvest error:", e);
    setLine("❌ ハーベスト設定失敗: " + e.message);
    alert("ハーベスト設定失敗: " + e.message);
  }
}

/* ============================================================
   委任解除（Unlink）
   セッション内に直近生成したリモート鍵があればその公開鍵を使う。
   無い場合(リロード後など)は解除対象を特定できないため、
   手動でリモート公開鍵を入力してもらう。
============================================================ */
export async function stopHarvest() {
  const statusEl = document.getElementById("harvest-status");
  const setLine = (text) => {
    if (statusEl) statusEl.textContent = text;
    console.log("[harvest]", text);
  };

  try {
    if (!appState.facade || !appState.currentPubKey) {
      throw new Error("SDK未初期化またはアカウント未接続です");
    }

    let remotePublicKeyHex = lastRemoteKeys?.remotePublicKey;

    if (!remotePublicKeyHex) {
      remotePublicKeyHex = prompt(
        "このセッションで委任した記録が見つかりませんでした。\n" +
        "解除するリモートアカウントの公開鍵を入力してください\n" +
        "（委任開始時にコンソールへ出力・表示された remotePublicKey です）："
      );
      if (!remotePublicKeyHex) {
        setLine("解除をキャンセルしました");
        return;
      }
    }

    if (!confirm(`リモート公開鍵 ${remotePublicKeyHex} の委任を解除します。よろしいですか？`)) {
      setLine("解除をキャンセルしました");
      return;
    }

    const { descriptors, models } = appState.sdkNem;

    setLine("解除トランザクションを署名しています...");
    const descriptor = new descriptors.ImportanceTransferTransactionV1Descriptor(
      models.ImportanceTransferMode.DEACTIVATE,
      new appState.sdkCore.PublicKey(remotePublicKeyHex)
    );
    const tx = appState.facade.createTransactionFromTypedDescriptor(
      descriptor,
      appState.currentPubKey,
      appState.feeMultiplier ?? 1,
      60 * 60
    );

    const hash = await signAndAnnounceTx(tx);
    setLine(`解除Tx送信済み (${hash.slice(0, 12)}...) 承認待ち...`);

    const address = appState.currentAddress.toString();
    await waitConfirmed(hash, address);

    lastRemoteKeys = null;
    setLine("✅ 委任ハーベスティングを解除しました");
    await checkHarvestStatus();
    alert("委任ハーベスティングの解除が完了しました。");
  } catch (e) {
    console.error("stopHarvest error:", e);
    setLine("❌ 解除失敗: " + e.message);
    alert("解除失敗: " + e.message);
  }
}
