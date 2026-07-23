// supernode.js
// NEMスーパーノード・プログラムへの「エントリー(登録)」機能
//
// 公式手順(https://docs.nem.io/pages/Guides/supernode-program/docs.en.html)によると、
// スーパーノード運用は
//   ① 24時間稼働できるサーバーを用意する
//   ② そこにNISノード + Node Servantソフトを設置し、委任ハーベスト用の
//      秘密鍵(delegated private key)で自動起動するよう設定する
//   ③ ポート(7890, 7880, 7778)を開放する
//   ④ 「エントリー(登録)」トランザクションを送信する
//      (transfer transaction, message: "enroll <NODE_HOST> <CODEWORD_HASH>"
//       を、その月のエントリー用アドレスに送る)
// という流れになっており、①〜③は完全にサーバー側(NISノードの管理者)の作業で、
// ブラウザ上のウォレットだけでは完結しません。
// このファイルが自動化しているのは ④ のトランザクション送信部分のみです。

import { appState } from "./config.js";
import { signAndAnnounceTx } from "./auth.js";
import { normalizeAddress } from "./utils.js";

const SUPERNODE_MIN_XEM = 10010;

/* ============================================================
   参加条件(残高)の確認
============================================================ */
export function checkSupernodeRequirements() {
  const el = document.getElementById("supernode-requirements");
  if (!el) return;

  const xemInfo = appState.mosaicInfo?.["nem:xem"];
  const balance = xemInfo ? Number(xemInfo.amount) / 10 ** xemInfo.divisibility : 0;
  const ok = balance >= SUPERNODE_MIN_XEM;

  el.innerHTML = `
    <div class="harvest-history-item">
      <div>現在の残高: ${balance.toLocaleString("ja-JP", { maximumFractionDigits: 6 })} XEM</div>
      <div>必要な残高: ${SUPERNODE_MIN_XEM.toLocaleString("ja-JP")} XEM
        (参加用 10,000 XEM + 手数料バッファ 約10 XEM)</div>
      <div>${ok ? "✅ 残高の条件は満たしています" : "❌ 残高が不足しています"}</div>
    </div>
  `;
}

/* ============================================================
   コードワードハッシュの取得
   NEM公式API: https://nem.io/supernode/api/codeword/<main_public_key>
   ※ 外部(nem.io)のAPIのため、CORSやAPI自体の稼働状況によっては
     取得に失敗することがあります。その場合は手動で入力してください。
============================================================ */
export async function fetchCodewordHash() {
  const statusEl = document.getElementById("supernode-codeword-status");
  const inputEl = document.getElementById("supernode-codeword");
  if (statusEl) statusEl.textContent = "取得中...";

  try {
    if (!appState.currentPubKey) {
      throw new Error("アカウントが未接続です");
    }

    const res = await fetch(`https://nem.io/supernode/api/codeword/${appState.currentPubKey}`);
    if (!res.ok) {
      throw new Error(`APIエラー(${res.status})`);
    }
    const json = await res.json();
    const codeword = json?.codeword ?? json?.data ?? null;

    if (!codeword) {
      throw new Error("コードワードが取得できませんでした");
    }

    if (inputEl) inputEl.value = codeword;
    if (statusEl) statusEl.textContent = "✅ 取得しました";
  } catch (e) {
    console.error("fetchCodewordHash error:", e);
    if (statusEl) {
      statusEl.textContent =
        "取得に失敗しました(nem.ioのAPIが現在稼働していない可能性があります)。お手数ですが手動で入力してください。";
    }
  }
}

/* ============================================================
   エントリー(登録)トランザクションの送信
   通常のXEM送金(0 XEM + メッセージのみ)として送る。
============================================================ */
export async function submitEnrollTransaction({ nodeHost, enrollAddress, codewordHash }) {
  if (!nodeHost) throw new Error("ノードホストを入力してください");
  if (!enrollAddress) throw new Error("今月のエントリー用アドレスを入力してください");
  if (!codewordHash) throw new Error("コードワードハッシュを入力または取得してください");

  const { descriptors, models } = appState.sdkNem;

  const messageText = `enroll ${nodeHost} ${codewordHash}`;
  const messageDescriptor = new descriptors.MessageDescriptor(models.MessageType.PLAIN, messageText);

  const descriptor = new descriptors.TransferTransactionV1Descriptor(
    new appState.sdkNem.Address(normalizeAddress(enrollAddress)),
    new models.Amount(0n), // メッセージのみ(XEM送金額は0)
    messageDescriptor
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  return await signAndAnnounceTx(tx);
}
