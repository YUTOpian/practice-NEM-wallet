// transfer.js
// NEM (NIS1) 送金トランザクション
//
// ⚠️ 注意: NemFacadeのTransferTransactionディスクリプタのフィールド名は
//   Symbol版の実装(descriptors.TransferTransactionV1Descriptor(recipientAddress,
//   mosaics, message))に倣って推測実装している。実行前に一度、
//   ブラウザのコンソールで `appState.sdkNem.descriptors` の中身を確認し、
//   実際のクラス名・コンストラクタ引数と一致するか確認してください。

import { appState, XEM_MOSAIC_KEY } from "./config.js";
import { setStatus } from "./ui.js";
import { getRecipientPublicKey } from "./account.js";
import { signAndAnnounceTx, encryptMessageLocally } from "./auth.js";

export async function sendTx() {
  if (
    !appState.NODE ||
    !appState.currentAddress ||
    !appState.currentPubKey ||
    !appState.isSdkReady
  ) {
    setStatus("tx-status", "初期化が未完了です。", "error");
    return;
  }

  const recipientRaw = document.getElementById("tx-recipient").value.trim();
  const amountStr = document.getElementById("tx-amount").value;
  const messageText = document.getElementById("tx-message").value || "";
  const selectedMosaicId = document.getElementById("selected-mosaic-id")?.value;

  if (!selectedMosaicId) {
    setStatus("tx-status", "モザイクを選択してください。", "error");
    return;
  }
  if (!recipientRaw || amountStr === "") {
    setStatus("tx-status", "アドレスと金額は必須です。", "error");
    return;
  }

  const recipientAddress = new appState.sdkNem.Address(recipientRaw);
  const amount = Number(amountStr);

  if (Number.isNaN(amount) || amount <= 0) {
    setStatus("tx-status", "金額が不正です。", "error");
    return;
  }

  const divisibility = appState.mosaicInfo?.[selectedMosaicId]?.divisibility ?? 0;
  const rawQuantity = BigInt(Math.floor(amount * (10 ** divisibility)));

  /*
    メッセージ
    NEM: { type: 1(平文) | 2(暗号化), payload: bytes }
    暗号化がチェックされている場合は、受信者の公開鍵を取得し
    ローカル(ニーモニック/秘密鍵)署名アカウントの鍵でNEM方式の暗号化を行う。
  */
  const shouldEncrypt = !!document.getElementById("tx-encrypt")?.checked;
  let message;

  if (shouldEncrypt && messageText.trim() !== "") {
    try {
      setStatus("tx-status", "受信者の公開鍵を取得中...");
      const recipientPubKeyHex = await getRecipientPublicKey(recipientAddress);

      setStatus("tx-status", "メッセージを暗号化しています...");
      message = encryptMessageLocally(recipientPubKeyHex, messageText);
    } catch (e) {
      console.error("encrypt message error:", e);
      setStatus(
        "tx-status",
        "メッセージの暗号化に失敗しました（受信者アカウントに公開鍵が公開されていない可能性があります）。",
        "error"
      );
      return;
    }
  } else if (messageText.trim() !== "") {
    message = {
      type: 1,
      payload: appState.sdkCore.utils.uint8ToHex(new TextEncoder().encode(messageText)),
    };
  } else {
    message = { type: 0, payload: "" };
  }

  /*
    Mosaic Descriptor
    XEM自体を送る場合はmosaics:[]で amount にmicroXEMを指定、
    カスタムモザイクを送る場合は mosaics:[{mosaicId, amount}] を使う想定。
  */
  const { descriptors, models } = appState.sdkNem;
  let mosaics = [];
  let xemAmount = 0n;

  if (selectedMosaicId === XEM_MOSAIC_KEY) {
    xemAmount = rawQuantity;
  } else {
    const [namespaceId, name] = selectedMosaicId.split(":");
    mosaics = [
      {
        mosaicId: new models.MosaicId(namespaceId, name),
        amount: rawQuantity,
      },
    ];
    // NEMのモザイク付き送金は、慣習上 amount に最低額(1 microXEM相当)を
    // 入れておく実装が多い(手数料計算に影響するため)
    xemAmount = 1n;
  }

  const descriptor = new descriptors.TransferTransactionV1Descriptor(
    recipientAddress,
    xemAmount,
    mosaics,
    message
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60 // deadline 1時間
  );

  try {
    setStatus("tx-status", "署名しています...");
    const hash = await signAndAnnounceTx(tx);
    setStatus("tx-status", `送金しました。\nHash: ${hash}`, "success");
  } catch (e) {
    console.error("transfer error:", e);
    setStatus("tx-status", e.message || "署名または送信に失敗しました。", "error");
  }
}
