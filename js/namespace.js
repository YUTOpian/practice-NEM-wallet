// namespace.js
// ネームスペースの登録(ルート/子)・自分が保有するネームスペース一覧の取得
//
// NEM(NIS1)のネームスペースは、Symbolと異なり「有効期間をブロック数で指定」しない。
// ルートネームスペースはレンタル料(XEM)を払って取得し、ネットワーク規定の期間
// (NIS1では約1年)で失効する仕様のため、durationの入力項目は無くしている。
//
// ⚠️ ProvisionNamespaceTransactionディスクリプタのフィールド名は
//   Symbol版の実装パターンから類推している。実行前に
//   `appState.sdkNem.descriptors` の内容を確認してください。

import { appState } from "./config.js";
import { signAndAnnounceTx } from "./auth.js";

/* ============================================================
   保有ネームスペース一覧
============================================================ */
export async function loadOwnedNamespaces() {
  const el = document.getElementById("namespace-list");
  if (!el) return;

  el.textContent = "読み込み中...";

  try {
    const address = appState.currentAddress.toString();
    const res = await fetch(
      `${appState.NODE}/account/namespace/page?address=${encodeURIComponent(address)}&pageSize=100`
    );
    const json = await res.json();
    const items = json.data ?? [];

    if (items.length === 0) {
      el.innerHTML = `<div style="color:#94a3b8;">保有しているネームスペースはありません</div>`;
      return;
    }

    el.innerHTML = items
      .map((ns) => {
        const depth = (ns.fqn.match(/\./g) || []).length + 1;
        const level = depth === 1 ? "ルート" : `子(レベル${depth})`;

        return `
          <div class="harvest-history-item">
            <div>種別: ${level}</div>
            <div>名前: ${ns.fqn}</div>
            <div>失効高さ: ${ns.height ?? "---"}</div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error("loadOwnedNamespaces error:", e);
    el.textContent = "取得に失敗しました";
  }
}

/* ============================================================
   ルートネームスペース候補(子ネームスペース登録時の親選択用)
============================================================ */
export async function populateParentNamespaceSelect() {
  const select = document.getElementById("child-namespace-parent-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- 読み込み中... --</option>`;

  try {
    const address = appState.currentAddress.toString();
    const res = await fetch(
      `${appState.NODE}/account/namespace/page?address=${encodeURIComponent(address)}&pageSize=100`
    );
    const json = await res.json();
    const items = json.data ?? [];

    // ルート(fqnに"."を含まない)のみ親候補にする
    const roots = items.filter((ns) => !ns.fqn.includes("."));

    if (roots.length === 0) {
      select.innerHTML = `<option value="">-- 保有ルートネームスペースがありません --</option>`;
      return;
    }

    select.innerHTML =
      `<option value="">-- 親ネームスペースを選択 --</option>` +
      roots.map((ns) => `<option value="${ns.fqn}">${ns.fqn}</option>`).join("");
  } catch (e) {
    console.warn("親ネームスペース候補の取得に失敗しました", e);
    select.innerHTML = `<option value="">-- 取得に失敗しました --</option>`;
  }
}

/* ============================================================
   ルートネームスペース登録
============================================================ */
export async function registerRootNamespace(name) {
  const { descriptors } = appState.sdkNem;

  const descriptor = new descriptors.ProvisionNamespaceTransactionV1Descriptor(
    name,
    undefined // 親なし = ルート
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  return await signAndAnnounceTx(tx);
}

/* ============================================================
   子ネームスペース登録
============================================================ */
export async function registerChildNamespace(parentFqn, childName) {
  const { descriptors } = appState.sdkNem;

  const descriptor = new descriptors.ProvisionNamespaceTransactionV1Descriptor(
    childName,
    parentFqn
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  return await signAndAnnounceTx(tx);
}
