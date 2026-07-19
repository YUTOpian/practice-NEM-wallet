// harvest.js
// 委任ハーベスティング (Delegated Harvesting) フル実装
//
// 手順:
//   ① AccountKeyLinkTransaction  … メインアカウントの重要度をリモート署名アカウントへ委任
//   ② VrfKeyLinkTransaction      … VRF鍵をメインアカウントにリンク（委任ハーベスト必須）
//   ③ NodeKeyLinkTransaction     … どのノードに委任するかをオンチェーンで宣言
//   ①②③は1つのAggregate Complete Transactionにまとめ、SSSで署名してアナウンスする
//   ④ PersistentDelegationRequestTransaction
//        … リモート鍵・VRF鍵の秘密鍵を「ノード宛」に暗号化したメッセージとして
//          TransferTransactionに載せて送る。これでノードがハーベスト委任を認識する。
//
// 参考: https://docs.symbol.dev/concepts/harvesting.html
//       https://docs.symbol.dev/guides/harvesting/activating-delegated-harvesting-manual.html

import { appState, MAINNET_NODEWATCH_URL, TESTNET_NODEWATCH_URL, NetworkType } from "./config.js";
import { setStatus } from "./ui.js";
import { requestSign } from "./signer.js";

/* ============================================================
   委任先ノード候補の読み込み（NodeWatchから取得しプルダウンに反映）
   ※ ここで出てくるのは単にオンラインなノード一覧であり、
     「委任ハーベスティングを受け付けている」保証はない。
============================================================ */
export async function loadHarvestNodeCandidates() {
  const select = document.getElementById("harvest-node-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- 候補を読み込み中... --</option>`;

  const isTestnet = appState.networkType === NetworkType.TESTNET;
  const url = isTestnet ? TESTNET_NODEWATCH_URL : MAINNET_NODEWATCH_URL;

  try {
    const res = await fetch(url);
    const nodes = await res.json();

    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error("empty");
    }

    nodes.sort((a, b) => b.height - a.height);

    select.innerHTML =
      `<option value="">-- ノードを選択（未選択なら接続中ノードを使用）--</option>` +
      nodes
        .slice(0, 30)
        .map((n) => {
          const label = `${n.endpoint}（高さ:${n.height}）`;
          return `<option value="${n.endpoint}">${label}</option>`;
        })
        .join("");
  } catch (e) {
    console.warn("ノード候補の取得に失敗しました", e);
    select.innerHTML = `<option value="">-- 候補の取得に失敗（下に直接URLを入力してください）--</option>`;
  }
}

/* ============================================================
   実際に使用する委任先ノードURLを決定
   優先順位: 直接入力欄 > プルダウン選択 > 現在接続中のノード(appState.NODE)
============================================================ */
function getSelectedHarvestNodeUrl() {
  const manual = document.getElementById("harvest-node-input")?.value?.trim();
  if (manual) return manual;

  const selected = document.getElementById("harvest-node-select")?.value?.trim();
  if (selected) return selected;

  return appState.NODE;
}

/* ============================================================
   直近生成したリモート鍵・VRF鍵（セッション内のみ保持）
   ページをリロードすると消えるので、④が失敗した場合に備えて
   画面にも表示してユーザーに控えてもらう。
============================================================ */
let lastGeneratedKeys = null;

/* ============================================================
   ランダム秘密鍵生成（32byte）
============================================================ */
function randomPrivateKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return new appState.sdkCore.PrivateKey(bytes);
}

function toHex(bytesOrKey) {
  const bytes = bytesOrKey.bytes ?? bytesOrKey;
  return appState.sdkCore.utils.uint8ToHex(bytes);
}

/* ============================================================
   ノード公開鍵取得 (/node/info の nodePublicKey)
   ※ これは NodeKeyLinkTransaction 用の鍵であり、
     REST証明書(CA)公開鍵とは別物なので注意
============================================================ */
async function fetchNodePublicKey(nodeUrl) {
  const res = await fetch(new URL("/node/info", nodeUrl));
  const info = await res.json();
  if (!info.nodePublicKey) {
    throw new Error(`ノード(${nodeUrl})から nodePublicKey を取得できませんでした`);
  }
  return new appState.sdkCore.PublicKey(info.nodePublicKey);
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
    const res = await fetch(`${appState.NODE}/accounts/${address}`);
    const json = await res.json();
    const account = json.account;

    if (!account) {
      statusEl.textContent = "アカウント情報取得失敗";
      setBadge("inactive", "❌ アカウント未登録");
      return;
    }

    const importance = account.importance;
    console.log("importance:", importance);

    if (importanceEl) {
      importanceEl.textContent = importance ? BigInt(importance).toString() : "0";
    }

    // supplementalPublicKeys の有無で委任状況を判定
    const keys = account.supplementalPublicKeys;
    const linked = !!keys?.linked;
    const vrf = !!keys?.vrf;
    const node = !!keys?.node;
    const linkedInfo = `remote:${linked} vrf:${vrf} node:${node}`;

    if (linked && vrf && node) {
      setBadge("active", "✅ 委任ハーベスティング設定済み（鍵リンク完了）");
    } else if (linked || vrf || node) {
      setBadge("partial", "⚠️ 一部の鍵のみリンク済み（設定不完全）");
    } else {
      setBadge("inactive", "❌ 委任ハーベスティング未設定");
    }

    statusEl.textContent =
      importance && Number(importance) > 0
        ? `重要度あり ${linkedInfo}`
        : `重要度なし ${linkedInfo}`;
  } catch (e) {
    console.error("Harvest status error:", e);
    statusEl.textContent = "状態取得エラー";
    setBadge("inactive", "❌ 状態取得エラー");
  }
}

/* ============================================================
   トランザクション確認待ち（承認 or 失敗まで polling）
============================================================ */
async function waitConfirmed(hash, { timeoutMs = 60000, intervalMs = 3000 } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${appState.NODE}/transactionStatus/${hash}`);
      if (res.ok) {
        const json = await res.json();
        if (json.group === "confirmed") return true;
        if (json.group === "failed") {
          throw new Error("Transaction failed: " + (json.code ?? "unknown"));
        }
      }
    } catch (e) {
      // 404 = まだunconfirmedにも乗っていない可能性があるので継続
      console.warn("waitConfirmed polling error:", e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("承認待ちがタイムアウトしました");
}

/* ============================================================
   SSSで署名 → アナウンス（共通処理）
============================================================ */
async function signAndAnnounce(tx) {
  const payload = appState.sdkCore.utils.uint8ToHex(tx.serialize());

  const signed = await requestSign(payload);

  const res = await fetch(new URL("/transactions", appState.NODE), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: signed.payload }),
  });

  const result = await res.json();
  console.log("announce result:", result);

  if (!res.ok) {
    throw new Error(result.message ?? "アナウンス失敗");
  }

  // ★ハッシュは「署名済み」のペイロードから計算し直す
  //   （署名前のtxオブジェクトのままだと署名欄が空でハッシュが一致しない）
  const signedBytes = appState.sdkCore.utils.hexToUint8(signed.payload);
  const signedTx = appState.facade.transactionFactory.static.deserialize(signedBytes);
  const hash = appState.facade.hashTransaction(signedTx).toString();
  return hash;
}

/* ============================================================
   ① + ② + ③ を1つのAggregate Complete Transactionにまとめて送信
============================================================ */
async function announceKeyLinks(remoteKeyPair, vrfKeyPair, nodePublicKey) {
  const { descriptors, models } = appState.sdkSymbol;

  const embedded = [
    appState.facade.createEmbeddedTransactionFromTypedDescriptor(
      new descriptors.AccountKeyLinkTransactionV1Descriptor(
        remoteKeyPair.publicKey,
        models.LinkAction.LINK
      ),
      appState.currentPubKey
    ),
    appState.facade.createEmbeddedTransactionFromTypedDescriptor(
      new descriptors.VrfKeyLinkTransactionV1Descriptor(
        vrfKeyPair.publicKey,
        models.LinkAction.LINK
      ),
      appState.currentPubKey
    ),
    appState.facade.createEmbeddedTransactionFromTypedDescriptor(
      new descriptors.NodeKeyLinkTransactionV1Descriptor(
        nodePublicKey,
        models.LinkAction.LINK
      ),
      appState.currentPubKey
    ),
  ];

  const aggregateDescriptor = new descriptors.AggregateCompleteTransactionV2Descriptor(
    appState.facade.static.hashEmbeddedTransactions(embedded),
    embedded
  );

  const aggregateTx = appState.facade.createTransactionFromTypedDescriptor(
    aggregateDescriptor,
    appState.currentPubKey,
    100,
    60 * 60
  );

  return await signAndAnnounce(aggregateTx);
}

/* ============================================================
   ④ PersistentDelegationRequestTransaction の作成・送信
   ※ ここは symbol-sdk のバージョンによってAPI名が変わりやすい部分。
     見つからない場合は encoder のプロパティ一覧をconsoleに出して
     原因を特定できるようにしている。
============================================================ */
async function announcePersistentDelegationRequest(remoteKeyPair, vrfKeyPair, nodePublicKey) {
  const { descriptors, MessageEncoder } = appState.sdkSymbol;

  if (typeof MessageEncoder !== "function") {
    throw new Error(
      "このSDKバージョンには MessageEncoder が見つかりません。sdk.js で読み込んでいる " +
      "symbol-sdk のバンドル内容を console.log(appState.sdkSymbol) で確認してください。"
    );
  }

  // 暗号化自体はメインアカウントの秘密鍵を必要としない
  // （SDKが内部でephemeralな鍵を都度生成しノード公開鍵とECDHするため）。
  // encoder の生成にダミーのKeyPairが必要なSDKもあるので、その場合は
  // ランダム鍵で作ったAccount相当のオブジェクトを渡す。
  let encodedMessage;
  try {
    const dummyKeyPair = new appState.sdkSymbol.KeyPair(randomPrivateKey());
    const encoder = new MessageEncoder(dummyKeyPair);

    if (typeof encoder.encodePersistentHarvestingDelegation === "function") {
      encodedMessage = encoder.encodePersistentHarvestingDelegation(
        nodePublicKey,
        remoteKeyPair,
        vrfKeyPair
      );
    } else {
      console.warn(
        "encodePersistentHarvestingDelegation が見つかりません。利用可能なメソッド:",
        Object.getOwnPropertyNames(Object.getPrototypeOf(encoder))
      );
      throw new Error("MessageEncoderに委任メッセージ用のメソッドが見つかりませんでした");
    }
  } catch (e) {
    console.error("Persistent delegation message encode error:", e);
    throw e;
  }

  const nodeAddress = appState.sdkSymbol.Address.fromPublicKey
    ? appState.sdkSymbol.Address.fromPublicKey(nodePublicKey, appState.networkType)
    : appState.facade.network.publicKeyToAddress(nodePublicKey);

  const transferDescriptor = new descriptors.TransferTransactionV1Descriptor(
    nodeAddress,
    [],
    encodedMessage
  );

  const transferTx = appState.facade.createTransactionFromTypedDescriptor(
    transferDescriptor,
    appState.currentPubKey,
    100,
    60 * 60
  );

  return await signAndAnnounce(transferTx);
}

/* ============================================================
   委任ハーベスティング開始（メインエントリポイント）
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

    setLine(`ノード情報取得中... (${harvestNodeUrl})`);
    const nodePublicKey = await fetchNodePublicKey(harvestNodeUrl);

    setLine("リモート鍵・VRF鍵を生成中...");
    const remoteKeyPair = new appState.sdkSymbol.KeyPair(randomPrivateKey());
    const vrfKeyPair = new appState.sdkSymbol.KeyPair(randomPrivateKey());

    // 画面に残しておく（④が失敗しても後で再送できるように）
    lastGeneratedKeys = {
      remotePrivateKey: toHex(remoteKeyPair.privateKey),
      vrfPrivateKey: toHex(vrfKeyPair.privateKey),
    };
    console.warn(
      "生成したリモート鍵・VRF鍵の秘密鍵（この画面を閉じると失われます。再送が必要な場合のため控えてください）:",
      lastGeneratedKeys
    );

    setLine("① AccountKeyLink / ② VrfKeyLink / ③ NodeKeyLink をSSSで署名してください...");
    const aggHash = await announceKeyLinks(remoteKeyPair, vrfKeyPair, nodePublicKey);
    setLine(`鍵リンクTx送信済み (${aggHash.slice(0, 12)}...) 承認待ち...`);

    await waitConfirmed(aggHash);
    setLine("鍵リンク承認完了。④ 委任リクエストを送信します...");

    const delegationHash = await announcePersistentDelegationRequest(
      remoteKeyPair,
      vrfKeyPair,
      nodePublicKey
    );

    setLine(`✅ 委任リクエスト送信完了 (${delegationHash.slice(0, 12)}...)。ノード側の反映をお待ちください。`);
    alert(
      "委任ハーベスティングの設定リクエストを送信しました。\n" +
      "ノードが承諾すると数分〜数十分程度でハーベストが始まる場合があります。\n" +
      "（ノード側の判断次第のため、必ず開始される保証はありません）"
    );
  } catch (e) {
    console.error("startHarvest error:", e);
    setLine("❌ ハーベスト設定失敗: " + e.message);
    alert("ハーベスト設定失敗: " + e.message);
  }
}

/* ============================================================
   委任解除（Unlink）
   ※ セッション内の一時キーには依存せず、REST APIで
     「現在チェーン上にリンクされている公開鍵」を取得して
     それをUNLINKする。これによりページ再読み込み後でも解除可能。
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

    setLine("現在の委任状況を確認中...");
    const address = appState.currentAddress.toString();
    const res = await fetch(`${appState.NODE}/accounts/${address}`);
    const json = await res.json();
    const keys = json.account?.supplementalPublicKeys;

    const linkedHex = keys?.linked?.publicKey;
    const vrfHex = keys?.vrf?.publicKey;
    const nodeHex = keys?.node?.publicKey;

    if (!linkedHex && !vrfHex && !nodeHex) {
      setLine("解除対象がありません（未設定）");
      alert("現在、委任ハーベスティングの鍵リンクは設定されていません。");
      return;
    }

    const summary = [
      linkedHex ? `remote: ${linkedHex}` : null,
      vrfHex ? `vrf: ${vrfHex}` : null,
      nodeHex ? `node: ${nodeHex}` : null,
    ].filter(Boolean).join("\n");

    if (!confirm(`以下のリンクを解除します。よろしいですか？\n\n${summary}`)) {
      setLine("解除をキャンセルしました");
      return;
    }

    const { descriptors, models } = appState.sdkSymbol;
    const embedded = [];

    if (linkedHex) {
      embedded.push(
        appState.facade.createEmbeddedTransactionFromTypedDescriptor(
          new descriptors.AccountKeyLinkTransactionV1Descriptor(
            new appState.sdkCore.PublicKey(linkedHex),
            models.LinkAction.UNLINK
          ),
          appState.currentPubKey
        )
      );
    }
    if (vrfHex) {
      embedded.push(
        appState.facade.createEmbeddedTransactionFromTypedDescriptor(
          new descriptors.VrfKeyLinkTransactionV1Descriptor(
            new appState.sdkCore.PublicKey(vrfHex),
            models.LinkAction.UNLINK
          ),
          appState.currentPubKey
        )
      );
    }
    if (nodeHex) {
      embedded.push(
        appState.facade.createEmbeddedTransactionFromTypedDescriptor(
          new descriptors.NodeKeyLinkTransactionV1Descriptor(
            new appState.sdkCore.PublicKey(nodeHex),
            models.LinkAction.UNLINK
          ),
          appState.currentPubKey
        )
      );
    }

    const aggregateDescriptor = new descriptors.AggregateCompleteTransactionV2Descriptor(
      appState.facade.static.hashEmbeddedTransactions(embedded),
      embedded
    );

    const aggregateTx = appState.facade.createTransactionFromTypedDescriptor(
      aggregateDescriptor,
      appState.currentPubKey,
      100,
      60 * 60
    );

    setLine("解除トランザクションをSSSで署名してください...");
    const hash = await signAndAnnounce(aggregateTx);
    setLine(`解除Tx送信済み (${hash.slice(0, 12)}...) 承認待ち...`);

    await waitConfirmed(hash);

    lastGeneratedKeys = null;
    setLine("✅ 委任ハーベスティングを解除しました");
    await checkHarvestStatus();
    alert("委任ハーベスティングの解除が完了しました。");
  } catch (e) {
    console.error("stopHarvest error:", e);
    setLine("❌ 解除失敗: " + e.message);
    alert("解除失敗: " + e.message);
  }
}
