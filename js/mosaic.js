// mosaic.js
// モザイクの作成・自分が保有するモザイク一覧の取得
//
// NEM(NIS1)ではSymbolと異なり、モザイクは必ず「既存の自分のネームスペースの下」に
// 作成時点で属する(namespaceId.mosaicName)。Symbolのような「後からネームスペースに
// リンクする」操作は存在しないため、作成時にネームスペース選択を必須にしている。
//
// ⚠️ MosaicDefinitionTransactionディスクリプタの引数は
//   Symbol版の実装パターンから類推している。実行前に
//   `appState.sdkNem.descriptors` の内容を確認してください。

import { appState } from "./config.js";
import { formatMosaicAmount } from "./utils.js";
import { signAndAnnounceTx } from "./auth.js";

/* ============================================================
   保有ネームスペース候補の取得 (モザイクの作成先選択用)
============================================================ */
export async function fetchOwnedNamespaceOptions() {
  const address = appState.currentAddress.toString();
  const res = await fetch(
    `${appState.NODE}/account/namespace/page?address=${encodeURIComponent(address)}&pageSize=100`
  );
  const json = await res.json();
  const items = json.data ?? [];
  return items.map((ns) => ({ id: ns.fqn, name: ns.fqn }));
}

export async function fetchOwnedMosaicIds() {
  const address = appState.currentAddress.toString();
  const res = await fetch(
    `${appState.NODE}/account/mosaic/owned?address=${encodeURIComponent(address)}`
  );
  const json = await res.json();
  return (json.data ?? []).map((item) => `${item.mosaicId.namespaceId}:${item.mosaicId.name}`);
}

/* ============================================================
   保有モザイク一覧
   (NISには「自分が定義者になっているモザイク」だけを絞り込むAPIが無いため、
    保有しているモザイク全てを表示する。自分が作成したものも通常ここに含まれる)
============================================================ */
export async function loadOwnedMosaicsWithAlias() {
  const el = document.getElementById("owned-mosaic-list");
  if (!el) return;

  el.textContent = "読み込み中...";

  try {
    const address = appState.currentAddress.toString();
    const res = await fetch(
      `${appState.NODE}/account/mosaic/owned?address=${encodeURIComponent(address)}`
    );
    const json = await res.json();
    const mosaicItems = json.data ?? [];

    if (mosaicItems.length === 0) {
      el.innerHTML = `<div style="color:#94a3b8;">保有しているモザイクはありません</div>`;
      return;
    }

    el.innerHTML = mosaicItems
      .map((item) => {
        const id = item.mosaicId;
        const key = `${id.namespaceId}:${id.name}`;
        const divisibility = appState.mosaicInfo?.[key]?.divisibility ?? 0;

        return `
          <div class="harvest-history-item">
            <div>モザイク: ${key}</div>
            <div>保有量: ${formatMosaicAmount(item.quantity, divisibility)}</div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error("loadOwnedMosaicsWithAlias error:", e);
    el.textContent = "取得に失敗しました";
  }
}

/* ============================================================
   モザイク作成用: 保有ネームスペース候補(作成先選択)
============================================================ */
export async function populateMosaicNamespaceSelect() {
  const select = document.getElementById("mosaic-link-namespace-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- 読み込み中... --</option>`;

  try {
    const options = await fetchOwnedNamespaceOptions();
    select.innerHTML = options.length
      ? options.map((ns) => `<option value="${ns.id}">${ns.name}</option>`).join("")
      : `<option value="">-- 保有ネームスペースがありません(先に登録してください) --</option>`;
  } catch (e) {
    console.warn("ネームスペース候補の取得に失敗しました", e);
    select.innerHTML = `<option value="">-- 取得に失敗しました --</option>`;
  }
}

/* ============================================================
   モザイク作成
============================================================ */
export async function createMosaic({
  namespaceFqn,
  mosaicName,
  description,
  divisibility,
  supplyMutable,
  transferable,
  initialSupply,
}) {
  if (!namespaceFqn) {
    throw new Error("作成先のネームスペースを選択してください");
  }

  const { descriptors, models } = appState.sdkNem;

  const mosaicId = new models.MosaicId(namespaceFqn, mosaicName);

  const properties = [
    { name: "divisibility", value: String(divisibility) },
    { name: "initialSupply", value: String(Math.floor(initialSupply)) },
    { name: "supplyMutable", value: supplyMutable ? "true" : "false" },
    { name: "transferable", value: transferable ? "true" : "false" },
  ];

  const descriptor = new descriptors.MosaicDefinitionTransactionV1Descriptor(
    mosaicId,
    description,
    properties,
    undefined // levy(手数料徴収)なし
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  return await signAndAnnounceTx(tx);
}
