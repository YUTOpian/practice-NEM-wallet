// account.js
// アカウント残高・保有モザイク取得

import { appState } from "./config.js";
import { setStatus } from "./ui.js";

function toBigInt(uint64) {

  if (!uint64) return 0n;


  // UInt64形式
  if (typeof uint64 === "object") {

    const unsignedLower =
      BigInt(uint64.lower >>> 0);

    const unsignedHigher =
      BigInt(uint64.higher >>> 0);

    return (unsignedHigher << 32n) | unsignedLower;

  }


  // 文字列の場合
  if (typeof uint64 === "string") {

    if (/^[0-9A-Fa-f]+$/.test(uint64)) {

      return BigInt("0x" + uint64);

    }

    return BigInt(uint64);

  }


  return BigInt(uint64);

}

export async function refreshAccount() {
  if (!appState.NODE || !appState.currentAddress) return;

  setStatus("account-status", "残高取得中…");

  try {
    const address = appState.currentAddress.toString();
    document.getElementById("account-address").textContent = address;

const res = await fetch(new URL(`/accounts/${address}`, appState.NODE));

//
// まだ一度もチェーンに登場していないアカウント
//
if (res.status === 404) {

  console.log("新規アカウント");

  appState.mosaicInfo = {};

  document.getElementById("account-balance").textContent =
    "0.000 XYM";

  const mosaicList =
    document.getElementById("mosaic-list");

  if (mosaicList) {
    mosaicList.innerHTML =
      "<div>保有トークンはありません</div>";
  }

  setStatus(
    "account-status",
    "新規アカウントです",
    "success"
  );

  return;
}

const data = await res.json();
const mosaics = data.account.mosaics || [];

    /*
      モザイクネームスペース取得
    */
    const namespaceMap = {};
    const mosaicIds = mosaics.map(m => {
      if (typeof m.id === "object") {
        return toBigInt(m.id)
  .toString(16)
  .toUpperCase()
  .padStart(16, "0");
      }
      return typeof m.id === "string" ? m.id.toUpperCase() : m.id.toString(16).toUpperCase();
    });

    try {
      const namespaceRes = await fetch(
        new URL("/namespaces/mosaic/names", appState.NODE),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mosaicIds })
        }
      );

      const namespaceData = await namespaceRes.json();
      for (const item of namespaceData.mosaicNames || []) {
        const mosaicId = item.mosaicId.toUpperCase();
        if (item.names && item.names.length > 0) {
          namespaceMap[mosaicId] = item.names[0];
        }
      }
    } catch(e) {
      console.warn("ネームスペース取得失敗", e);
    }

    /*
      モザイク情報保存初期化
    */
    appState.mosaicInfo = {};

    const mosaicList = document.getElementById("mosaic-list");
    if (mosaicList) mosaicList.innerHTML = "";

    const select = document.getElementById("tx-mosaic");
    if (select) select.innerHTML = "";

    // APIリクエストの並列化用配列
    const fetchPromises = mosaics.map(async (mosaic) => {
      // IDのパース
let idHex;

if (typeof mosaic.id === "string") {

  idHex = mosaic.id.toUpperCase();

} else {

  idHex = toBigInt(mosaic.id)
    .toString(16)
    .toUpperCase()
    .padStart(16, "0");

}

      // 保有量のパース（amountがobject構造の場合を考慮）
      const amount = Number(
        typeof mosaic.amount === "object"
          ? toBigInt(mosaic.amount)
          : (mosaic.amount ?? mosaic.quantity ?? 0)
      );

      let divisibility = 0;
      let name = namespaceMap[idHex] ?? idHex;

      // XYMは固定で可分性6
      if (idHex === "6BED913FA20223F8" || idHex === "72C0212E67A08BCE") {
        name = "XYM";
        divisibility = 6;
      } else {
        try {
          // モザイク情報の個別取得
            const mosaicRes = await fetch(
    new URL(`/mosaics/${idHex}`, appState.NODE)
  );


 if (!mosaicRes.ok) {

    console.warn(
      "モザイク詳細取得不可:",
      idHex,
      mosaicRes.status
    );

    // 詳細取得できないモザイクは仮に可分性0
    return {
      idHex,
      amount,
      divisibility: 0,
      name: namespaceMap[idHex] ?? idHex
    };

}


  const mosaicData =
    await mosaicRes.json();


  const mosaicInfo =
    mosaicData.mosaic;


  divisibility =
    mosaicInfo?.properties?.find(
      (p) => p.id === 1
    )?.value ?? 0;


}catch(e) {
          console.warn("モザイク情報取得失敗", idHex);
        }
      }

      // 処理結果をオブジェクトにして返す
      return { idHex, amount, divisibility, name };
    });

    // すべてのモザイク情報フェッチを「同時に」実行
    const enrichedMosaics = await Promise.all(fetchPromises);

    // UIへの描画処理
    for (const itemData of enrichedMosaics) {
      const { idHex, amount, divisibility, name } = itemData;

      // アプリ状態に保存
      appState.mosaicInfo[idHex] = { name, divisibility, amount };

      // 送信用プルダウン追加
      if (select) {
        const option = document.createElement("option");
        option.value = idHex;
        option.textContent = `${name} (${(amount / (10 ** divisibility)).toLocaleString()})`;
        select.appendChild(option);
      }

      // 保有モザイク一覧へ追加
      if (mosaicList) {
        const item = document.createElement("div");
        item.className = "mosaic-item";

        const resolvedName = (idHex === "6BED913FA20223F8" || idHex === "72C0212E67A08BCE")
          ? "XYM"
          : (namespaceMap[idHex] ?? name);

        item.innerHTML = `
          <div class="mosaic-left">
            <div class="mosaic-name">${resolvedName}</div>
            <div class="mosaic-id">${idHex}</div>
          </div>
          <div class="mosaic-right">
            <div class="mosaic-amount">
              ${(amount / (10 ** divisibility)).toLocaleString()}
            </div>
          </div>
        `;

        item.onclick = () => {
          console.log("モザイククリック:", idHex);

          if (select) {
            select.value = idHex;
          }

          // 選択モザイク情報保存（要素のタイプに合わせてフォールバックを用意）
          const idEl = document.getElementById("selected-mosaic-id");
          if (idEl) {
            "value" in idEl ? (idEl.value = idHex) : (idEl.textContent = idHex);
          }

          const nameEl = document.getElementById("selected-mosaic-name");
          if (nameEl) {
            nameEl.textContent = resolvedName;
          }

          const balanceEl = document.getElementById("selected-mosaic-balance");
          if (balanceEl) {
            balanceEl.textContent = `${(amount / (10 ** divisibility)).toLocaleString()}`;
          }

          const dialog = document.getElementById("transfer-dialog");
          if (dialog && typeof dialog.showModal === "function") {
            dialog.showModal();
          }
        };

        mosaicList.appendChild(item);
      }
    }

    // XYM残高表示の更新
    const xymId = appState.networkType === 152 ? "72C0212E67A08BCE" : "6BED913FA20223F8";
    const xym = appState.mosaicInfo[xymId];

    document.getElementById("account-balance").textContent = xym
      ? `${(xym.amount / (10 ** xym.divisibility)).toFixed(3)} XYM`
      : "0.000 XYM";

    setStatus("account-status", "取得成功", "success");

  } catch(e) {
    console.error(e);
    setStatus("account-status", "取得に失敗しました", "error");
  }
}
