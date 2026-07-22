// account.js
// Account情報取得・XEM/モザイク残高取得 (NIS1 REST API)

import { appState, XEM_MOSAIC_KEY, XEM_DIVISIBILITY } from "./config.js";
import { setStatus } from "./ui.js";
import { formatMosaicAmount } from "./utils.js";

function mosaicKey(namespaceId, name) {
  return `${namespaceId}:${name}`;
}

/* ============================================================
   モザイク定義(可分性など)の取得。ネームスペース単位でまとめて取得しキャッシュする
============================================================ */
const definitionCache = {};

async function fetchMosaicDivisibility(namespaceId, name) {
  const key = mosaicKey(namespaceId, name);
  if (key === XEM_MOSAIC_KEY) return XEM_DIVISIBILITY;
  if (definitionCache[key] != null) return definitionCache[key];

  try {
    const res = await fetch(
      `${appState.NODE}/namespace/mosaic/definition/page?namespace=${encodeURIComponent(namespaceId)}&pageSize=100`
    );
    const json = await res.json();
    for (const item of json?.data ?? []) {
      const id = item.mosaic?.id ?? item.id;
      const k = mosaicKey(id?.namespaceId, id?.name);
      const props = item.mosaic?.properties ?? item.properties ?? [];
      const divProp = props.find((p) => p.name === "divisibility");
      definitionCache[k] = divProp ? parseInt(divProp.value, 10) : 0;
    }
  } catch (e) {
    console.warn("モザイク定義取得失敗", namespaceId, e);
  }

  return definitionCache[key] ?? 0;
}

export async function refreshAccount() {
  if (!appState.NODE || !appState.currentAddress) {
    return;
  }

  setStatus("account-status", "Account情報取得中…");

  try {
    const address = appState.currentAddress.toString();
    document.getElementById("account-address").textContent = address;

    const accountRes = await fetch(
      `${appState.NODE}/account/get?address=${encodeURIComponent(address)}`
    );

    if (!accountRes.ok) {
      console.log("未登録Account、または取得失敗");
      appState.mosaicInfo = {};
      document.getElementById("account-balance").textContent = "0.000000 XEM";
      const mosaicList = document.getElementById("mosaic-list");
      if (mosaicList) mosaicList.innerHTML = "<div>保有Mosaicはありません</div>";
      setStatus("account-status", "新規Accountです(まだ受信履歴がありません)", "success");
      return;
    }

    const accountJson = await accountRes.json();
    const accountInfo = accountJson.account;

    appState.accountInfo = accountInfo;

    /*
      XEM残高 (account.balance は raw micro-XEM)
    */
    const xemBalanceRaw = accountInfo?.balance ?? 0;

    /*
      保有モザイク一覧
    */
    const mosaicsRes = await fetch(
      `${appState.NODE}/account/mosaic/owned?address=${encodeURIComponent(address)}`
    );
    const mosaicsJson = await mosaicsRes.json();
    const ownedMosaics = mosaicsJson?.data ?? [];

    appState.mosaicInfo = {};

    const mosaicList = document.getElementById("mosaic-list");
    if (mosaicList) mosaicList.innerHTML = "";

    const select = document.getElementById("tx-mosaic");
    if (select) select.innerHTML = "";

    // まずXEM自体を先頭に登録
    appState.mosaicInfo[XEM_MOSAIC_KEY] = {
      mosaicName: "XEM",
      amount: xemBalanceRaw,
      divisibility: XEM_DIVISIBILITY,
    };

    const mosaicInfoList = [
      { mosaicId: XEM_MOSAIC_KEY, mosaicAmount: xemBalanceRaw, divisibility: XEM_DIVISIBILITY, mosaicName: "XEM" },
    ];

    for (const item of ownedMosaics) {
      const id = item.mosaicId;
      const key = mosaicKey(id.namespaceId, id.name);
      if (key === XEM_MOSAIC_KEY) continue; // xemは上で登録済み(通常ここには出てこない)

      const divisibility = await fetchMosaicDivisibility(id.namespaceId, id.name);
      const mosaicName = `${id.namespaceId}:${id.name}`;

      mosaicInfoList.push({
        mosaicId: key,
        mosaicAmount: item.quantity,
        divisibility,
        mosaicName,
      });
    }

    for (const mosaic of mosaicInfoList) {
      const { mosaicId, mosaicAmount, divisibility, mosaicName } = mosaic;

      appState.mosaicInfo[mosaicId] = { mosaicName, amount: mosaicAmount, divisibility };

      if (select) {
        const option = document.createElement("option");
        option.value = mosaicId;
        option.textContent = `${mosaicName} (${formatMosaicAmount(mosaicAmount, divisibility)})`;
        select.appendChild(option);
      }

      if (mosaicList) {
        const displayItem = document.createElement("div");
        displayItem.className = "mosaic-item";

        displayItem.innerHTML = `
          <div class="mosaic-left">
            <div class="mosaic-name">${mosaicName}</div>
            <div class="mosaic-id">${mosaicId}</div>
          </div>
          <div class="mosaic-right">
            <div class="mosaic-amount">${formatMosaicAmount(mosaicAmount, divisibility)}</div>
          </div>
        `;

        displayItem.onclick = () => {
          if (select) select.value = mosaicId;

          const idElement = document.getElementById("selected-mosaic-id");
          if (idElement) {
            "value" in idElement ? (idElement.value = mosaicId) : (idElement.textContent = mosaicId);
          }

          const nameElement = document.getElementById("selected-mosaic-name");
          if (nameElement) nameElement.textContent = mosaicName;

          const balanceElement = document.getElementById("selected-mosaic-balance");
          if (balanceElement) balanceElement.textContent = formatMosaicAmount(mosaicAmount, divisibility);

          const dialog = document.getElementById("transfer-dialog");
          if (dialog && typeof dialog.showModal === "function") dialog.showModal();
        };

        mosaicList.appendChild(displayItem);
      }
    }

    document.getElementById("account-balance").textContent =
      `${formatMosaicAmount(xemBalanceRaw, XEM_DIVISIBILITY)} XEM`;

    setStatus("account-status", "取得成功", "success");
  } catch (e) {
    console.error(e);
    setStatus("account-status", "取得に失敗しました", "error");
  }
}

/*
  受信者Account PublicKey取得 (暗号化メッセージ送信用)
*/
export async function getRecipientPublicKey(address) {
  const res = await fetch(
    `${appState.NODE}/account/get?address=${encodeURIComponent(address.toString())}`
  );
  const json = await res.json();
  const publicKey = json?.account?.publicKey;

  if (!publicKey) {
    throw new Error("受信者のPublicKeyが取得できません(このアドレスは一度も送信を行ったことがない可能性があります)");
  }

  return publicKey;
}
