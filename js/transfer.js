// transfer.js
// Symbol SDK v3
// モザイク送金トランザクション（SSS署名）

import { appState } from "./config.js";
import { setStatus } from "./ui.js";

export async function sendTx() {
  /*
    初期化確認
  */
  if (
    !appState.NODE ||
    !appState.currentAddress ||
    !appState.currentPubKey ||
    !appState.isSdkReady
  ) {
    setStatus("tx-status", "初期化が未完了です。", "error");
    return;
  }

  /*
    入力取得
  */
  const recipientRaw = document.getElementById("tx-recipient").value.trim();
  const amountStr = document.getElementById("tx-amount").value;
  const messageText = document.getElementById("tx-message").value || "";
  const selectedMosaicId = document.getElementById("selected-mosaic-id")?.value;

  /*
    入力チェック
  */
  if (!selectedMosaicId) {
    setStatus("tx-status", "モザイクを選択してください。", "error");
    return;
  }

  if (!recipientRaw || amountStr === "") {
    setStatus("tx-status", "アドレスと金額は必須です。", "error");
    return;
  }

  /*
    Address
  */
  const recipientAddress = new appState.sdkSymbol.Address(recipientRaw);
  const amount = Number(amountStr);

  if (Number.isNaN(amount) || amount <= 0) {
    setStatus("tx-status", "金額が不正です。", "error");
    return;
  }

  /*
    Mosaic情報取得
  */
  const divisibility = appState.mosaicInfo?.[selectedMosaicId]?.divisibility ?? 0;

  /*
    Mosaic Descriptor作成
  */
  const mosaic = new appState.sdkSymbol.descriptors.UnresolvedMosaicDescriptor(
    new appState.sdkSymbol.models.UnresolvedMosaicId(BigInt("0x" + selectedMosaicId)),
    new appState.sdkSymbol.models.Amount(BigInt(Math.floor(amount * (10 ** divisibility))))
  );

  /*
    Message
    速習Symbol v3形式
    0x00 = Plain Message
  */
  const messageBytes = new TextEncoder().encode(messageText);
  const message = new Uint8Array([0x00, ...messageBytes]);

  /*
    Transfer Descriptor
    TransferTransactionV1
  */
  const descriptor = new appState.sdkSymbol.descriptors.TransferTransactionV1Descriptor(
    recipientAddress,
    [mosaic],
    message
  );

  /*
    Transaction作成
    feeMultiplier 100
    deadline 1時間
  */
  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    100,
    60 * 60
  );

  /*
    SSSへ渡すpayload生成
    Symbol v3 serialized transaction
  */
  const payload = appState.sdkCore.utils.uint8ToHex(tx.serialize());

  try {
    setStatus("tx-status", "SSSで署名待ち...");

    /*
      SSS署名
    */
    window.SSS.setTransactionByPayload(payload);
    const signed = await window.SSS.requestSign();

    if (!signed?.payload) {
      throw new Error("SSS signature failed");
    }

    /*
      Announce
      /transactions PUT
    */
    const response = await fetch(new URL("/transactions", appState.NODE), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ payload: signed.payload })
    });

    const result = await response.json();
    console.log("announce result:", result);

    if (response.ok) {
      const hash = appState.facade.hashTransaction(tx).toString();
      setStatus("tx-status", `送金しました。\nHash: ${hash}`, "success");
    } else {
      setStatus("tx-status", result.message ?? "アナウンス失敗", "error");
    }
  } catch(e) {
    console.error("transfer error:", e);
    setStatus("tx-status", "署名または送信に失敗しました。", "error");
  }
}
