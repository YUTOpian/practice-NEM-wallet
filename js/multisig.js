// multisig.js
// マルチシグ設定 / マルチシグ送金 / マルチシグ署名(連署)  — NEM(NIS1)版
//
// NEMのマルチシグはSymbolと違い、アグリゲートボンデッドTxやハッシュロックを
// 使わない、よりシンプルな仕組み:
//   ① マルチシグ設定変更: MultisigAccountModificationTransactionを
//      対象アカウント自身が直接署名・即アナウンス。
//      (新規追加される連署者からの同意手続きは無い。追加自体が即時反映される)
//   ② マルチシグ送金/操作: 中身の Transaction(例:Transfer)を
//      MultisigTransactionで包んで、連署者の1人が署名・即アナウンス。
//      必要承認数(minCosignatories)に足りない場合は「未承認」のまま
//      /account/unconfirmedTransactions に residual として残り続け、
//      他の連署者が MultisigSignatureTransaction で連署するたびに
//      承認が積み上がり、閾値に達すると承認(confirmed)される。
//
// ⚠️ 各ディスクリプタのフィールド名はSymbol版実装のパターンから類推している。
//   実行前に `appState.sdkNem.descriptors` の内容を確認してください。

import { appState } from "./config.js";
import { signAndAnnounceTx } from "./auth.js";
import { normalizeAddress } from "./utils.js";

/* ============================================================
   マルチシグ情報の取得
   NIS1の /account/get は meta.cosignatories / meta.cosignatoryOf /
   account.multisigInfo をまとめて返してくれるため、Symbolのように
   専用エンドポイントを叩く必要はない。
============================================================ */
export async function loadMultisigInfo() {
  const el = document.getElementById("multisig-info");
  if (!el) return;

  el.textContent = "読み込み中...";

  try {
    const address = appState.currentAddress.toString();
    const res = await fetch(`${appState.NODE}/account/get?address=${encodeURIComponent(address)}`);
    const json = await res.json();

    const multisigInfo = json.account?.multisigInfo;
    const cosignatories = json.meta?.cosignatories ?? [];
    const cosignatoryOf = json.meta?.cosignatoryOf ?? [];

    if (!multisigInfo && cosignatoryOf.length === 0) {
      el.innerHTML = `<div style="color:#94a3b8;">このアカウントはまだマルチシグ化されていません</div>`;
      return;
    }

    const cosignatoriesHtml =
      cosignatories.map((c) => `<div>・${c.address}</div>`).join("") || "<div>(なし)</div>";
    const multisigAddressesHtml =
      cosignatoryOf.map((c) => `<div>・${c.address}</div>`).join("") || "<div>(なし)</div>";

    el.innerHTML = `
      <div class="harvest-history-item">
        ${multisigInfo ? `<div>最小承認者数(minCosignatories): ${multisigInfo.minCosignatories}</div>` : ""}
        ${multisigInfo ? `<div>連署者数: ${multisigInfo.cosignatoriesCount}</div>` : ""}
        <div>連署者:</div>
        ${cosignatoriesHtml}
        <div>自分が連署者になっているマルチシグアカウント:</div>
        ${multisigAddressesHtml}
      </div>
    `;
  } catch (e) {
    console.error("loadMultisigInfo error:", e);
    el.textContent = "取得に失敗しました";
  }
}

/* ============================================================
   自分が連署者になっているマルチシグアカウント一覧(送金元選択用)
============================================================ */
export async function fetchCosignatoryOfAddresses() {
  const address = appState.currentAddress.toString();
  const res = await fetch(`${appState.NODE}/account/get?address=${encodeURIComponent(address)}`);
  const json = await res.json();
  return (json.meta?.cosignatoryOf ?? []).map((c) => c.address);
}

/* ============================================================
   マルチシグ設定(自分自身のアカウントを対象)
   NEMは同意手続きが無く、直接署名・即アナウンスで完結する。
============================================================ */
export async function updateMultisigSettings({
  minApprovalDelta,
  additionAddresses,
  deletionAddresses,
}) {
  const { descriptors, models } = appState.sdkNem;

  const modifications = [
    ...additionAddresses.map((a) => ({
      modificationType: models.MultisigModificationType.ADD,
      cosignatoryPublicKey: a, // 追加はアドレスではなく公開鍵が必要な点に注意
    })),
    ...deletionAddresses.map((a) => ({
      modificationType: models.MultisigModificationType.DELETE,
      cosignatoryPublicKey: a,
    })),
  ];

  const descriptor = new descriptors.MultisigAccountModificationTransactionV1Descriptor(
    modifications,
    minApprovalDelta
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
   マルチシグ送金
============================================================ */
export async function sendFromMultisig({ multisigAddress, recipientAddress, amountXem, message }) {
  const { descriptors, models } = appState.sdkNem;

  multisigAddress = normalizeAddress(multisigAddress);
  recipientAddress = normalizeAddress(recipientAddress);

  const accountInfo = await fetch(
    `${appState.NODE}/account/get?address=${encodeURIComponent(multisigAddress)}`
  ).then((r) => r.json());
  const multisigPublicKey = accountInfo.account?.publicKey;
  if (!multisigPublicKey) {
    throw new Error("送金元アカウントの公開鍵が取得できません(未初期化アカウントの可能性があります)");
  }

  const messageDescriptor = new descriptors.MessageDescriptor(
    models.MessageType.PLAIN,
    message && message.trim() !== "" ? message : ""
  );

  const innerDescriptor = new descriptors.TransferTransactionV1Descriptor(
    new appState.sdkNem.Address(recipientAddress),
    new models.Amount(BigInt(Math.floor(amountXem * 1_000_000))),
    messageDescriptor
  );

  const innerTx = appState.facade.createEmbeddedTransactionFromTypedDescriptor(
    innerDescriptor,
    new appState.sdkCore.PublicKey(multisigPublicKey)
  );

  const multisigDescriptor = new descriptors.MultisigTransactionV1Descriptor(innerTx);

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    multisigDescriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  return await signAndAnnounceTx(tx);
}

/* ============================================================
   マルチシグ署名(保留中のマルチシグTx一覧・連署)
   自分が連署者になっている全マルチシグアカウントの未承認Txを集めて表示する
============================================================ */
export async function loadPendingPartialTransactions() {
  const el = document.getElementById("multisig-pending-list");
  if (!el) return;

  el.textContent = "読み込み中...";

  try {
    const multisigAddresses = await fetchCosignatoryOfAddresses();

    if (multisigAddresses.length === 0) {
      el.innerHTML = `<div style="color:#94a3b8;">連署者になっているマルチシグアカウントがありません</div>`;
      return;
    }

    const allPending = [];

    for (const multisigAddress of multisigAddresses) {
      const res = await fetch(
        `${appState.NODE}/account/unconfirmedTransactions?address=${encodeURIComponent(multisigAddress)}`
      );
      const json = await res.json();
      const items = json.data ?? [];

      for (const item of items) {
        const tx = item.transaction;
        if (tx.type !== 4100 /* MULTISIG */) continue;

        const hash = item.meta?.hash?.data ?? item.meta?.hash;
        const signatures = tx.signatures ?? [];
        const alreadySigned = signatures.some(
          (s) => s.signer?.toUpperCase() === appState.currentPubKey?.toUpperCase()
        );

        allPending.push({ hash, multisigAddress, cosigCount: signatures.length, alreadySigned });
      }
    }

    if (allPending.length === 0) {
      el.innerHTML = `<div style="color:#94a3b8;">署名待ちのトランザクションはありません</div>`;
      return;
    }

    el.innerHTML = allPending
      .map(
        (p) => `
          <div class="harvest-history-item">
            <div>マルチシグアカウント: ${p.multisigAddress}</div>
            <div>Hash: ${p.hash}</div>
            <div>現在の連署数: ${p.cosigCount}</div>
            <div>${p.alreadySigned ? "✅ 署名済み" : ""}</div>
            ${
              p.alreadySigned
                ? ""
                : `<button class="account-hide-btn" data-action="cosign" data-hash="${p.hash}" data-multisig="${p.multisigAddress}">署名する</button>`
            }
          </div>
        `
      )
      .join("");
  } catch (e) {
    console.error("loadPendingPartialTransactions error:", e);
    el.textContent = "取得に失敗しました";
  }
}

export async function cosignPending(transactionHashHex, multisigAddress) {
  const { descriptors } = appState.sdkNem;

  const descriptor = new descriptors.MultisigSignatureTransactionV1Descriptor(
    transactionHashHex,
    new appState.sdkNem.Address(normalizeAddress(multisigAddress))
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  return await signAndAnnounceTx(tx);
}
