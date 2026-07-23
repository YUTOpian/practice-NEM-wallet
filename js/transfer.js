// transfer.js
// NEM (NIS1) 送金トランザクション
//
// symbol-sdk公式ドキュメント(npm README)に記載されている実例に基づく正しい書式:
//   new descriptors.TransferTransactionV1Descriptor(
//     new Address('...'),
//     new models.Amount(5100000n),                              // XEMの量(microXEM)
//     new descriptors.MessageDescriptor(models.MessageType.PLAIN, 'hello nem')
//   );
// ポイント:
//   ・引数は (recipientAddress, amount, messageDescriptor) の3つのみ
//   ・messageは { type, payload } のような単純オブジェクトではなく、
//     descriptors.MessageDescriptor のインスタンスが必要
//   ・平文メッセージはハイフン化(hex化)せず、文字列をそのまま渡す
//   ・V1はXEM専用で、カスタムモザイクの配列は取れない仕様のため、
//     カスタムモザイク送金はこのアプリでは現状未対応にしている
//     (V2に相当するディスクリプタの正確な仕様が確認できていないため)

import { appState, XEM_MOSAIC_KEY } from "./config.js";
import { setStatus } from "./ui.js";
import { getRecipientPublicKey } from "./account.js";
import { signAndAnnounceTx, encryptMessageLocally } from "./auth.js";
import { normalizeAddress } from "./utils.js";

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
  if (selectedMosaicId !== XEM_MOSAIC_KEY) {
    setStatus(
      "tx-status",
      "カスタムモザイクの送金は現在未対応です(検証中)。XEMを選択してください。",
      "error"
    );
    return;
  }
  if (!recipientRaw || amountStr === "") {
    setStatus("tx-status", "アドレスと金額は必須です。", "error");
    return;
  }

  const recipientAddress = new appState.sdkNem.Address(normalizeAddress(recipientRaw));
  const amount = Number(amountStr);

  if (Number.isNaN(amount) || amount <= 0) {
    setStatus("tx-status", "金額が不正です。", "error");
    return;
  }

  const rawQuantity = BigInt(Math.floor(amount * 1_000_000)); // XEMは常にdivisibility=6

  const { descriptors, models } = appState.sdkNem;

  /*
    メッセージ
    NemFacadeでは descriptors.MessageDescriptor(messageType, message) を使う。
    平文は文字列をそのまま、暗号化はencryptMessageLocallyが返すバイト列を渡す。
    暗号化がチェックされている場合は、受信者の公開鍵を取得し
    ローカル(ニーモニック/秘密鍵)署名アカウントの鍵でNEM方式の暗号化を行う。
  */
  const shouldEncrypt = !!document.getElementById("tx-encrypt")?.checked;
  let messageDescriptor;

  if (shouldEncrypt && messageText.trim() !== "") {
    try {
      setStatus("tx-status", "受信者の公開鍵を取得中...");
      const recipientPubKeyHex = await getRecipientPublicKey(recipientAddress);

      setStatus("tx-status", "メッセージを暗号化しています...");
      const encryptedBytes = encryptMessageLocally(recipientPubKeyHex, messageText);
      messageDescriptor = new descriptors.MessageDescriptor(models.MessageType.ENCRYPTED, encryptedBytes);
    } catch (e) {
      console.error("encrypt message error:", e);
      setStatus(
        "tx-status",
        "メッセージの暗号化に失敗しました（受信者アカウントに公開鍵が公開されていない可能性があります）。",
        "error"
      );
      return;
    }
  } else {
    messageDescriptor = new descriptors.MessageDescriptor(models.MessageType.PLAIN, messageText);
  }

  const descriptor = new descriptors.TransferTransactionV1Descriptor(
    recipientAddress,
    new models.Amount(rawQuantity),
    messageDescriptor
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
