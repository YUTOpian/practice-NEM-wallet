// bundle.js — 自動生成ファイル

// ======================== config.js ========================
// config.js
// NEM (NIS1) 用 設定値とアプリ全体で共有する状態
//
// symbol-sdk v3 は Symbol専用ではなく、NemFacade を含む共通SDKであるため、
// このアプリでは appState.sdkNem 経由でNEMのトランザクションを構築する。

// ============================================================
// NIS1 シードノード (HTTPS対応ノードのみ)
//
// NIS1ノードは基本 http://(7890) のみですが、一部の運用者は
// stunnel等で http→https のリバースプロキシを慣習的に 7891番ポートで
// 立てています。このアプリは常にHTTPSページから使うことを前提に、
// **HTTPS対応が確認できるノードのみ** を接続先候補にしています
// (HTTPのみのノードには一切接続しません。Mixed Content制限の回避と、
//  通信経路の暗号化の両方の理由からです)。
//
// 以下は https://nemnodes.org/nodes (NIS1ノード一覧) 上で "https" リンクが
// 掲載されていた(HTTPS対応が確認できた)メインネットノードの一部です。
// ノードの生死は流動的なので、実際に使う前に動作確認し、
// 定期的にメンテナンスしてください: https://nemnodes.org/nodes
// ============================================================
const MAINNET_SEED_NODES = [
  "https://arasio.tsvr.net:7891",
  "https://mosio.tsvr.net:7891",
  "https://norisio.tsvr.net:7891",
  "https://siomusubi.tsvr.net:7891",
  "https://tenpisio.tsvr.net:7891",
  "https://yukisio.tsvr.net:7891",
  "https://super-nem.love:7891",
  "https://luna2.dusanjp.com:7891",
  "https://nis1.dusanjp.com:7891",
  "https://nem01.symbol-node.com:7891",
  "https://nem06.symbol-node.com:7891",
  "https://nem08.symbol-node.com:7891",
  "https://sakia.nis1.harvestasya.com:7891",
  "https://siobeef.tsvr.net:7891",
  "https://eisa.kasanetalk.net:7891",
];

// テストネットのHTTPS対応ノード(動作確認済み)。
// 生死は流動的なので、繋がらなくなった場合は
// https://nemnodes.org/nodes_testnet で最新のノードを確認するか、
// 「設定 → 接続先ノードの変更」からHTTPS対応ノードを手動指定してください。
const TESTNET_SEED_NODES = [
  "https://ntn1.dusanjp.com:7891",
  "https://ntn2.dusanjp.com:7891",
];

// ============================================================
// XEM (ネイティブ通貨) 可分性
// NEMのXEMはモザイク登場以前からの「疑似モザイク」で、
// 常に namespaceId="nem", name="xem", divisibility=6 固定。
// ============================================================
const XEM_MOSAIC_ID = { namespaceId: "nem", name: "xem" };
const XEM_DIVISIBILITY = 6;
const XEM_MOSAIC_KEY = "nem:xem";

// ============================================================
// Network Type (版バイト。Symbolがこの数値をそのまま引き継いだため共通)
// ============================================================
const NetworkType = {
  MAINNET: 104, // 0x68 ("N"で始まるアドレス)
  TESTNET: 152, // 0x98 ("T"で始まるアドレス)
};

// ============================================================
// NEMのジェネシス(ネットワーク時刻の起点) 2015-03-29T00:06:25Z
// タイムスタンプ表示にのみ使用
// ============================================================
const NEM_EPOCH_UNIX_SECONDS = 1427587585;

// ============================================================
// NEM トランザクションタイプ定数(REST APIレスポンスの判別用)
// ============================================================
const NemTransactionType = {
  TRANSFER: 257,
  IMPORTANCE_TRANSFER: 2049,
  MULTISIG_AGGREGATE_MODIFICATION: 4097,
  MULTISIG_SIGNATURE: 4098,
  MULTISIG: 4100,
  PROVISION_NAMESPACE: 8193,
  MOSAIC_DEFINITION: 16385,
  MOSAIC_SUPPLY_CHANGE: 16386,
};

// ============================================================
// Application State
// ============================================================
const appState = {
  // 現在利用中Node
  NODE: null,

  // 手数料倍率(常に1固定。設定画面から変更する機能は廃止した)
  feeMultiplier: 1,

  // ========================================================
  // 認証方式: このアプリは常に "local"(ニーモニック/秘密鍵ログイン)
  // ========================================================
  authMode: null,
  localPrivateKeyHex: null,
  localKeyPair: null,

  // ========================================================
  // アカウント一覧（マルチアカウント切替）
  // ========================================================
  accounts: [],
  activeAccountId: null,

  // Symbol SDK v3 (NemFacade)
  facade: null,
  sdkCore: null,
  sdkNem: null,
  isSdkReady: false,

  // ========================================================
  // Account / Mosaic
  // ========================================================
  accountInfo: null,
  currentPubKey: null,
  currentAddress: null,
  networkType: null,
  mosaicList: [],
  mosaicInfo: {},
};

// ======================== utils.js ========================
//utils.js

// ============================================================
// アドレス文字列の正規化
// NEMのアドレスはハイフン区切り(例: NAAZO2-V43KQ7-BFJG7J-...)で
// 表示・コピーされることが多く、そのままSDKのAddressコンストラクタに渡すと
// base32デコードエラー(encoded size must be multiple of 8)になるため、
// ハイフン・空白を除去し大文字化してから使う。
// ============================================================
function normalizeAddress(input) {
  return (input || "").toString().replace(/[-\s]/g, "").toUpperCase();
}

function hexToBytes(hex) {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}

// ★ 2秒(+フェード)で自動消えるポップアップ表示

function showPopup(message, isError = false) {
  let popup = document.getElementById("copy-popup");

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "copy-popup";
    popup.className = "popup-card";
    popup.style.position = "fixed";

    // ▼▼ 中央配置 ▼▼
    popup.style.left = "50%";
    popup.style.top = "50%";
    popup.style.transform = "translate(-50%, -50%)";

    popup.style.zIndex = "9999";
    document.body.appendChild(popup);
  }

  popup.innerHTML = `
    <div>${message}</div>
  `;

  popup.style.display = "block";
  popup.style.opacity = "1";
  popup.style.transition = "opacity .4s";

  // ★ 一定時間後フェードアウト
  setTimeout(() => {
    popup.style.opacity = "0";

    setTimeout(() => {
      popup.style.display = "none";
    }, 400);
  }, 3000);
}

let soundQueue = Promise.resolve();

function playSoundOnce(file) {
  soundQueue = soundQueue
    .then(() => {
      return new Promise((resolve) => {
        const audio = new Audio(file);
        audio.volume = 1.0;

        audio.play().catch(() => {}).finally(() => {
          setTimeout(resolve, 100);
        });
      });
    });
}

// ============================================================
// モザイク/XEM 数量表示フォーマット
// ============================================================

function formatMosaicAmount(amount, divisibility = 0) {
  const value = Number(amount) / (10 ** divisibility);

  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: divisibility,
  });
}

function hexToUint8Array(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

// ============================================================
// #node-info 表示用 共通HTML生成
// ネットワーク表記（Mainnet/Testnet）のみを表示する
// (使用ノードのURL表示は廃止。テストネット時のみフォーセットへのリンクを添える)
// ============================================================

function renderNodeInfoHtml({ isTestnet, connected = true }) {
  const disconnectedBadge = connected
    ? ""
    : `<div style="font-size:14px;color:#94a3b8;">⚫️未接続</div>`;

  const faucetLink = isTestnet
    ? `<div style="font-size:13px;margin-top:2px;">` +
      `<a href="https://testnet.nem.tools/" target="_blank" rel="noopener" style="color:#8ab4f8;">THE XEM FAUCET</a>` +
      `</div>`
    : "";

  return (
    `<div style="font-size: 20px; font-weight: bold; color: #8ab4f8;">` +
    `${isTestnet ? "🟡 Testnet" : "🟢 Mainnet"}` +
    `</div>` +
    disconnectedBadge +
    faucetLink
  );
}

// ======================== ui.js ========================
// ui.js
// 単純な UI 操作用ユーティリティ

/**
 * テキストを書き換える
 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * ステータス表示を更新する
 * color: default / success / error
 */
function setStatus(id, text, type = "default") {
  const el = document.getElementById(id);
  if (!el) return;

  el.textContent = text;

  el.style.color =
    type === "success"
      ? "#10b981"   // 緑
      : type === "error"
      ? "#ef4444"   // 赤
      : "#e5e7eb";  // 通常
}

// ======================== sdk.js ========================
// sdk.js
// symbol-sdk v3 の読み込みと NemFacade 初期化
//
// symbol-sdk はSymbol専用ではなく、NEM(NIS1)用の NemFacade も
// 同梱している共通SDK。ブラウザ向けバンドルは
// `{ core, nem, symbol }` の3名前空間をexportする。
//
// NIS1のREST APIには Symbol の /network/properties に相当する
// エンドポイントが無いため、ネットワーク種別(Mainnet/Testnet)は
// ログイン画面でユーザーが選択した値(appState.networkType)を
// そのままFacadeの初期化に使う。

const SDK_VERSION = "3.3.0";

/**
 * SDK 初期化
 * NEMは /network/properties のようなネットワーク自己申告APIが無いため、
 * NODEが未設定でも(ノード選択前でも)初期化して問題ない。
 */
async function initSdk() {
  // ================================
  //   Symbol SDK 読み込み (nem名前空間を使用)
  // ================================
  const sdk = await import(
    `https://unpkg.com/symbol-sdk@${SDK_VERSION}/dist/bundle.web.js`
  );

  appState.sdkCore = sdk.core;
  appState.sdkNem = sdk.nem;

  if (!appState.sdkNem) {
    throw new Error(
      "このバージョンの symbol-sdk には NEM(nem名前空間)が含まれていません。SDKのバージョンを確認してください。"
    );
  }

  if (!appState.networkType) {
    throw new Error("ネットワーク種別(Mainnet/Testnet)が未設定です");
  }

  const identifier =
    appState.networkType === NetworkType.TESTNET ? "testnet" : "mainnet";

  // NemFacade の初期化(Symbol同様、ネットワーク識別子文字列を渡す)
  appState.facade = new appState.sdkNem.NemFacade(identifier);

  appState.isSdkReady = true;
}

/**
 * 外部アクセス用
 */
const facade = () => appState.facade;
const sdkCore = () => appState.sdkCore;
const sdkNem = () => appState.sdkNem;

// ======================== nodeSelector.js ========================
// nodeSelector.js
// このアプリは常に HTTPS対応ノードにのみ接続する仕様です
// (HTTPのみのノードは候補にすら入れません)。
//
// 理由:
//   ① このアプリ自体がHTTPS(GitHub Pages等)で配信されることを前提にしており、
//      HTTPのノードはブラウザのMixed Content制限で原理的に接続不可能
//   ② 通信経路の暗号化(盗聴・改ざん防止)のため
//
// NIS1ノードは基本 http://(7890)のみですが、一部の運用者は
// stunnel等で http→https のリバースプロキシを 7891番ポートで
// 慣習的に立てています。config.js の MAINNET_SEED_NODES には、
// https://nemnodes.org/nodes 上でHTTPS対応が確認できたノードのみを
// 登録しています。
//
// 接続できるHTTPS対応ノードが1つも見つからない場合、この関数は
// (画面に詳細な警告文を出すのではなく) null を返すだけにしてあります。
// 呼び出し側(index.js)で `if (!node) alert("ノードに接続できません")`
// のように、シンプルなアラートで知らせる設計にしています。

function isHttpsUrl(nodeUrl) {
  try {
    return new URL(nodeUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

async function isNodeAlive(nodeUrl, timeoutMs = 2500) {
  // HTTPS以外は候補にすら入れない
  if (!isHttpsUrl(nodeUrl)) return null;

  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(new URL("/chain/height", nodeUrl), { signal });
    clear();
    if (!res.ok) return null;
    const json = await res.json();
    const height = json?.height;
    return Number.isFinite(height) ? height : null;
  } catch (e) {
    clear();
    return null;
  }
}

/**
 * HTTPS対応ノードを1つ選んで返す。
 * 接続できるノードが無ければ null を返す(画面への警告表示はしない)。
 */
async function selectNode(isTestnet) {
  const infoEl = document.getElementById("node-info");
  const allSeeds = isTestnet ? TESTNET_SEED_NODES : MAINNET_SEED_NODES;
  const seeds = allSeeds.filter(isHttpsUrl);

  if (infoEl) infoEl.textContent = "ノードに接続中…";

  if (seeds.length === 0) {
    if (infoEl) {
      infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: false });
    }
    return null;
  }

  // シードノードをシャッフルして順番に試す
  const candidates = [...seeds].sort(() => Math.random() - 0.5);

  for (const nodeUrl of candidates) {
    const height = await isNodeAlive(nodeUrl);
    if (height != null) {
      if (infoEl) {
        infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: true });
      }
      return nodeUrl;
    }
  }

  // 全滅した場合は null を返す(http://へのフォールバックは絶対にしない)
  if (infoEl) {
    infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: false });
  }
  return null;
}

/**
 * 現在接続中のノードから、生きている他のピア(HTTPS版)の候補一覧を取得する
 * (設定画面のノード切替候補として利用)
 *
 * NIS1の /node/peer-list/reachable はピアの http(7890)情報しか返さないため、
 * 「httpsは同じホストの7891番ポートで慣習的に提供される」という前提で
 * 候補URLを組み立て、実際に生きているものだけに絞り込んで返す。
 * (この前提が外れているノードは単に候補から漏れるだけで、実害はない)
 */
async function fetchReachablePeers(nodeUrl) {
  try {
    const res = await fetch(new URL("/node/peer-list/reachable", nodeUrl));
    const json = await res.json();
    const list = json?.data ?? [];

    const httpsCandidates = [
      ...new Set(
        list
          .map((p) => p?.endpoint?.host)
          .filter(Boolean)
          .map((host) => `https://${host}:7891`)
      ),
    ].slice(0, 25); // 検証しすぎて重くならないよう上限を設ける

    const checked = await Promise.all(
      httpsCandidates.map(async (url) => ((await isNodeAlive(url, 2000)) != null ? url : null))
    );

    return checked.filter(Boolean);
  } catch (e) {
    console.warn("ピア一覧の取得に失敗しました", e);
    return [];
  }
}

// ======================== ws.js ========================
// ws.js
// NIS1にはSymbolのような単純なWebSocket購読(トピック文字列をsubscribeするだけ)は無く、
// SockJS+STOMPベースの別プロトコルになる。実装コストと安定性を考慮し、
// このアプリでは「数秒おきにREST APIを再取得するポーリング」で
// 同等のリアルタイム性(見た目上)を実現する。
//
// 呼び出し側(auth.js, settings.js, transactions.js等)からの見え方を変えないよう、
// 関数名は元のWebSocket版と同じ(initWebSocket / closeWebSocket / addCallback /
// getBlockTimestamp)にしてある。

const POLL_INTERVAL_MS = 8000;

let pollTimer = null;
let callbacks = {};
let knownUnconfirmedHashes = new Set();
let knownConfirmedHashes = new Set();
let soundHooksRegistered = false;

/* ============================================================
   ポーリング開始
============================================================ */
function initWebSocket(address) {
  closeWebSocket();

  knownUnconfirmedHashes = new Set();
  knownConfirmedHashes = new Set();
  registerSoundCallbacks(address);

  const tick = async () => {
    if (!appState.NODE || !appState.currentAddress) return;

    try {
      // 未承認トランザクション
      const unconfirmedRes = await fetch(
        `${appState.NODE}/account/unconfirmedTransactions?address=${address}`
      );
      const unconfirmedJson = await unconfirmedRes.json();
      const unconfirmedItems = unconfirmedJson?.data ?? [];

      for (const item of unconfirmedItems) {
        const hash = item.meta?.hash?.data ?? item.meta?.hash;
        if (!hash || knownUnconfirmedHashes.has(hash)) continue;
        knownUnconfirmedHashes.add(hash);

        const topic = `unconfirmedAdded/${address}`;
        (callbacks[topic] || []).forEach((cb) => cb({ data: item }));
      }

      // 承認済みトランザクション(直近分)
      const confirmedRes = await fetch(
        `${appState.NODE}/account/transfers/all?address=${address}&pageSize=10`
      );
      const confirmedJson = await confirmedRes.json();
      const confirmedItems = confirmedJson?.data ?? [];

      for (const item of confirmedItems) {
        const hash = item.meta?.hash?.data ?? item.meta?.hash;
        if (!hash || knownConfirmedHashes.has(hash)) continue;
        knownConfirmedHashes.add(hash);
        knownUnconfirmedHashes.delete(hash);

        const topic = `confirmedAdded/${address}`;
        (callbacks[topic] || []).forEach((cb) => cb({ data: item }));
      }
    } catch (e) {
      console.warn("polling error:", e);
    }
  };

  // 初回は「今ある分」を既知として扱うため、
  // コールバック発火なしで1回だけ状態を埋める
  (async () => {
    try {
      const confirmedRes = await fetch(
        `${appState.NODE}/account/transfers/all?address=${address}&pageSize=10`
      );
      const confirmedJson = await confirmedRes.json();
      for (const item of confirmedJson?.data ?? []) {
        const hash = item.meta?.hash?.data ?? item.meta?.hash;
        if (hash) knownConfirmedHashes.add(hash);
      }
    } catch (e) {
      console.warn("initial polling seed error:", e);
    }

    pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  })();
}

/* ============================================================
   ポーリング停止（ノード切替時などに使用）
============================================================ */
function closeWebSocket() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ============================================================
   callback 登録
============================================================ */
function addCallback(topic, cb) {
  if (!callbacks[topic]) callbacks[topic] = [];
  callbacks[topic].push(cb);
}

/* ============================================================
   block height → timestamp (NEMネットワーク時刻。秒単位)
   NIS1: GET /block/at/public { height } (POST)
============================================================ */
async function getBlockTimestamp(height) {
  try {
    const res = await fetch(new URL("/block/at/public", appState.NODE), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ height: Number(height) }),
    });
    const json = await res.json();
    return json?.timeStamp ?? null;
  } catch {
    return null;
  }
}

/* ============================================================
   未承認 / 承認の音を１回だけ登録
============================================================ */
function registerSoundCallbacks(address) {
  if (soundHooksRegistered) return;

  addCallback(`unconfirmedAdded/${address}`, () => {
    playSoundOnce("./sounds/ding.ogg");
  });

  addCallback(`confirmedAdded/${address}`, () => {
    playSoundOnce("./sounds/ding2.ogg");
  });

  soundHooksRegistered = true;
}

// ======================== account.js ========================
// account.js
// Account情報取得・XEM/モザイク残高取得 (NIS1 REST API)

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

async function refreshAccount() {
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
async function getRecipientPublicKey(address) {
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

// ======================== transactions.js ========================
// transactions.js
// NIS1 REST API 版のトランザクション一覧・履歴表示

const txMap = {};

/* ============================================================
   NEMネットワーク時刻 → 人間時間
============================================================ */
function formatTimestamp(nemTimestampSeconds) {
  if (nemTimestampSeconds == null) return "";
  const unixMs = (NEM_EPOCH_UNIX_SECONDS + Number(nemTimestampSeconds)) * 1000;
  return new Date(unixMs).toLocaleString("ja-JP", { hour12: false });
}

/* ============================================================
   メッセージ Decode
   NEM: { type: 1(平文) | 2(暗号化), payload: hex }
============================================================ */
function decodeMessage(message) {
  if (!message || !message.payload) return "(no message)";

  try {
    if (message.type === 2) {
      return "🔐 暗号化メッセージ";
    }
    const bytes = hexToBytes(message.payload);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("message decode error", e);
    return "(decode error)";
  }
}

/* ============================================================
   Address フォーマット(NIS1 REST APIのアドレスは基本そのままbase32)
============================================================ */
function formatAddress(address) {
  return address || "---";
}

/**
 * 送信者の公開鍵からアドレス(base32)を導出する
 */
function publicKeyToAddress(pubKeyHex) {
  if (!pubKeyHex) return "---";
  try {
    const pub = new appState.sdkCore.PublicKey(pubKeyHex);
    return appState.facade.network.publicKeyToAddress(pub).toString();
  } catch (e) {
    console.warn("publicKey→address変換失敗", e);
    return pubKeyHex;
  }
}

/* ============================================================
   マルチシグでラップされたTxは、実際の内容(otherTrans)を見る
============================================================ */
function unwrapTransaction(tx) {
  if (tx?.type === NemTransactionType.MULTISIG && tx.otherTrans) {
    return tx.otherTrans;
  }
  return tx;
}

/* ============================================================
   Explorer (NEMは公式エクスプローラが複数あるため一例としてnemtool/explorerを使用)
============================================================ */
function getExplorerUrl(hash) {
  return appState.networkType === NetworkType.TESTNET
    ? `https://testnet-explorer.nemtool.com/#/s_tx?hash=${hash}`
    : `https://explorer.nemtool.com/#/s_tx?hash=${hash}`;
}

/* ============================================================
   Mosaic/金額抽出
============================================================ */
function extractAmount(rawTx) {
  const tx = unwrapTransaction(rawTx);
  const signer = (tx.signer || "").toUpperCase();
  const myPub = (appState.currentPubKey || "").toUpperCase();
  const direction = signer === myPub ? "send" : "receive";

  // NEMの単純送金は amount(microXEM)、モザイク付き送金は mosaics[]
  const mosaics = [];

  if (tx.mosaics && tx.mosaics.length > 0) {
    for (const m of tx.mosaics) {
      const id = m.mosaicId;
      const key = `${id.namespaceId}:${id.name}`;
      const info = appState.mosaicInfo?.[key];
      const divisibility = info?.divisibility ?? 0;
      const name = info?.mosaicName ?? key;
      mosaics.push({ id: key, name, amount: Number(m.quantity) / (10 ** divisibility) });
    }
  } else if (tx.amount != null) {
    mosaics.push({ id: "nem:xem", name: "XEM", amount: Number(tx.amount) / 1_000_000 });
  }

  return { mosaics, direction, tx };
}

/* ============================================================
   Txカード
============================================================ */
function createTxCard(txInfo) {
  const { hash, msg, state, timestamp, mosaics, direction, sender, recipient } = txInfo;
  const explorer = getExplorerUrl(hash);
  const isSend = direction === "send";
  const label = isSend ? "送信" : "受信";
  const labelClass = isSend ? "tx-label-send" : "tx-label-receive";
  const amountClass = isSend ? "tx-amount-send" : "tx-amount-receive";
  const sign = isSend ? "-" : "+";

  let mosaicHtml = "";
  if (mosaics && mosaics.length) {
    mosaicHtml = mosaics.map(mosaic => `
      <div class="tx-mosaic">
        <span class="tx-mosaic-name">${mosaic.name}</span>
        <span class="tx-mosaic-amount ${amountClass}">${sign}${mosaic.amount}</span>
      </div>
    `).join("");
  }

  return `
    <div class="tx-item ${state === "unconfirmed" ? "unconfirmed" : "confirmed"}" id="tx-${hash}" onclick="window.open('${explorer}','_blank')">
      <div class="tx-body">
        <div class="tx-title ${labelClass}">${label}</div>
        <div class="tx-status">${state.toUpperCase()}</div>
        <div class="tx-address"><span class="tx-address-label">送金元</span><span class="tx-address-value">${sender ?? "---"}</span></div>
        <div class="tx-address"><span class="tx-address-label">送金先</span><span class="tx-address-value">${recipient ?? "---"}</span></div>
        ${mosaicHtml}
        <div class="tx-message"><span class="tx-message-label">メッセージ</span><span class="tx-message-value">${msg}</span></div>
        ${state === "confirmed" && timestamp != null ? `<div class="tx-time">🕒 ${formatTimestamp(timestamp)}</div>` : ""}
      </div>
    </div>
  `;
}

/* ============================================================
   DOM追加
============================================================ */
function appendTx(txInfo) {
  const list = document.getElementById("tx-list");
  list.insertAdjacentHTML("afterbegin", createTxCard(txInfo));
}

function buildTxInfo(item, address, state) {
  const meta = item.meta;
  const hash = meta?.hash?.data ?? meta?.hash;
  const rawTx = item.transaction;
  const amountInfo = extractAmount(rawTx);
  const tx = amountInfo.tx;

  return {
    hash,
    sender: amountInfo.direction === "send" ? address : publicKeyToAddress(tx.signer),
    recipient: formatAddress(tx.recipient),
    msg: decodeMessage(tx.message),
    state,
    timestamp: state === "confirmed" ? rawTx.timeStamp : null,
    mosaics: amountInfo.mosaics,
    direction: amountInfo.direction,
  };
}

/* ============================================================
   直近10件取得 (NIS1 /account/transfers/all)
============================================================ */
async function loadRecentTx() {
  const el = document.getElementById("tx-list");
  el.textContent = "読み込み中…";

  const address = appState.currentAddress.toString();
  const url = `${appState.NODE}/account/transfers/all?address=${encodeURIComponent(address)}&pageSize=10`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    const items = json.data ?? [];

    el.innerHTML = items
      .map((item) => {
        const txInfo = buildTxInfo(item, address, "confirmed");
        txMap[txInfo.hash] = txInfo;
        return createTxCard(txInfo);
      })
      .join("");
  } catch (e) {
    console.error(e);
    el.textContent = "読み込みエラー";
  }
}

/* ============================================================
   ポーリングによる擬似リアルタイム更新 (ws.js参照)
============================================================ */
function initLiveTx(address) {
  addCallback(`unconfirmedAdded/${address}`, (payload) => {
    const item = payload.data;
    const hash = item.meta?.hash?.data ?? item.meta?.hash;
    if (!hash || txMap[hash]) return;

    const txInfo = buildTxInfo(item, address, "unconfirmed");
    txMap[hash] = txInfo;
    appendTx(txInfo);
  });

  addCallback(`confirmedAdded/${address}`, (payload) => {
    const item = payload.data;
    const hash = item.meta?.hash?.data ?? item.meta?.hash;
    if (!hash) return;

    const txInfo = buildTxInfo(item, address, "confirmed");
    txMap[hash] = txInfo;

    // 既に(unconfirmedとして)表示済みのDOM要素があれば置き換える、無ければ先頭に追加
    const existing = document.getElementById(`tx-${hash}`);
    if (existing) {
      existing.outerHTML = createTxCard(txInfo);
    } else {
      appendTx(txInfo);
    }
  });
}


// ======================== auth.js ========================
// auth.js
// 認証方式の管理: ニーモニックインポート・秘密鍵インポート(ローカル署名)のみに対応。
// SSS Extension(Symbol専用の署名拡張機能)はNEMには使えないため撤去した。
// マルチアカウント対応。パスワードを設定した場合のみ、暗号化してlocalStorageに保存する。

const VAULT_KEY = "walletVault";

// 現在ログインに使ったニーモニック(セッション中のみメモリ保持、保存はしない)
let currentMnemonicPhrase = null;

function hasCurrentMnemonic() {
  return !!currentMnemonicPhrase;
}

/* ============================================================
   新規ニーモニック生成(「新規作成」機能用)
   BIP39の24単語(256bit)ニーモニックを生成して返す。
   まだどこにも保存しない(画面に表示して記録してもらうだけ)。
============================================================ */
async function generateNewMnemonic() {
  const [bip39, wordlistModule] = await Promise.all([
    import("https://esm.sh/@scure/bip39@2.2.0"),
    import("https://esm.sh/@scure/bip39@2.2.0/wordlists/english"),
  ]);
  const { wordlist } = wordlistModule;
  return bip39.generateMnemonic(wordlist, 256); // 24単語
}

/* ============================================================
   ニーモニック → 秘密鍵 (BIP39 + SLIP-10)
   導出パスはNEMのSLIP44コインタイプ(43)を使用: m/44'/43'/{account}'/0'/0'
   ({account}を変えることで同じニーモニックから複数アカウントを導出できる)

   ※ NISエコシステムの一部ウォレット(NanoWallet等)は、BIP39を使わず
     "パスフレーズ文字列のSHA3ハッシュをそのまま秘密鍵にする"独自方式を
     採っていたが、本アプリはSymbol系ウォレットと同じBIP39+HDパスに統一する
     (NEMコミュニティの一部HDウォレット実装とも互換のはずだが、
      既存のNIS1ウォレットからの秘密鍵そのもののインポートは
      「秘密鍵で追加」機能を使うこと)
============================================================ */
async function deriveFromMnemonic(mnemonicPhrase, accountIndex = 0) {
  const [bip39, wordlistModule, hdkeyModule] = await Promise.all([
    import("https://esm.sh/@scure/bip39@2.2.0"),
    import("https://esm.sh/@scure/bip39@2.2.0/wordlists/english"),
    import("https://esm.sh/micro-ed25519-hdkey@0.1.2"),
  ]);
  const { wordlist } = wordlistModule;
  const { HDKey } = hdkeyModule;

  const normalized = mnemonicPhrase
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, " ");

  const wordCount = normalized.split(" ").filter(Boolean).length;
  console.log("mnemonic word count:", wordCount);

  if (!bip39.validateMnemonic(normalized, wordlist)) {
    throw new Error("ニーモニックの形式が正しくありません（単語数やスペルを確認してください）");
  }

  const idx = Number.isInteger(accountIndex) && accountIndex >= 0 ? accountIndex : 0;
  const path = `m/44'/43'/${idx}'/0'/0'`; // NEMのSLIP44コインタイプ = 43

  const seed = bip39.mnemonicToSeedSync(normalized);
  const hdkey = HDKey.fromMasterSeed(seed);
  const child = hdkey.derive(path);

  const privateKeyHex = Array.from(child.privateKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return privateKeyHex;
}

/* ============================================================
   アカウント一覧への追加/更新
============================================================ */
function upsertAccount(entry) {
  const idx = appState.accounts.findIndex((a) => a.id === entry.id);
  if (idx >= 0) {
    appState.accounts[idx] = { ...appState.accounts[idx], ...entry };
  } else {
    appState.accounts.push(entry);
  }
}

function getAccounts() {
  return appState.accounts;
}

/* ============================================================
   アカウント切替（ニーモニック由来 / 秘密鍵由来）
============================================================ */
async function switchToAccount(id) {
  const acc = appState.accounts.find((a) => a.id === id);
  if (!acc) {
    throw new Error("アカウントが見つかりません");
  }

  closeWebSocket();

  if (!appState.isSdkReady) {
    const isTestnet = appState.networkType === NetworkType.TESTNET;
    appState.NODE = await selectNode(isTestnet);
    if (!appState.NODE) {
      throw new Error("ノードに接続できません");
    }
    await initSdk();
  }

  appState.authMode = "local";
  appState.localPrivateKeyHex = acc.privateKeyHex;

  const keyPair = new appState.facade.static.KeyPair(
    new appState.sdkCore.PrivateKey(acc.privateKeyHex)
  );
  appState.localKeyPair = keyPair;
  appState.currentPubKey = keyPair.publicKey.toString();
  appState.currentAddress = appState.facade.network.publicKeyToAddress(keyPair.publicKey);

  appState.activeAccountId = id;
  acc.address = appState.currentAddress.toString();

  setText("network-label", appState.networkType === NetworkType.TESTNET ? "Testnet" : "Mainnet");
  const addressEl = document.getElementById("account-address");
  if (addressEl) addressEl.textContent = appState.currentAddress.toString();

  await refreshAccount();
  await loadRecentTx();

  const address = appState.currentAddress.toString();
  initWebSocket(address);
  initLiveTx(address);

  await persistAccounts();
}

/* ============================================================
   ニーモニックでログイン（初回ログイン用。デフォルトでアカウント0を使う）
============================================================ */
async function loginWithMnemonic(mnemonicPhrase, networkType, accountIndex = 0) {
  const privateKeyHex = await deriveFromMnemonic(mnemonicPhrase, accountIndex);
  currentMnemonicPhrase = mnemonicPhrase;

  appState.networkType = networkType;

  const id = crypto.randomUUID();
  upsertAccount({
    id,
    label: `アカウント ${accountIndex + 1}`,
    source: "mnemonic",
    privateKeyHex,
    accountIndex,
    hidden: false,
  });

  await switchToAccount(id);
}

/* ============================================================
   アカウント追加（ログイン済みの状態で使う）
============================================================ */
function isDuplicatePrivateKey(privateKeyHex) {
  return appState.accounts.some(
    (a) => a.privateKeyHex && a.privateKeyHex.toUpperCase() === privateKeyHex.toUpperCase()
  );
}

async function addAccountFromMnemonic(mnemonicPhrase, accountIndex, label) {
  const privateKeyHex = await deriveFromMnemonic(mnemonicPhrase, accountIndex);

  if (isDuplicatePrivateKey(privateKeyHex)) {
    throw new Error("このアカウントはすでにインポートされています");
  }

  currentMnemonicPhrase = mnemonicPhrase;

  const id = crypto.randomUUID();
  const entry = {
    id,
    label: label?.trim() || `アカウント ${accountIndex + 1}`,
    source: "mnemonic",
    privateKeyHex,
    accountIndex,
    hidden: false,
  };
  upsertAccount(entry);
  await switchToAccount(id);
  return entry;
}

/* ============================================================
   ニーモニックログイン中、既にメモリにあるニーモニックを使って
   次のアカウントをワンクリックで追加する（再入力不要）
============================================================ */
async function addNextAccountFromCurrentMnemonic(label) {
  if (!currentMnemonicPhrase) {
    throw new Error("ニーモニックがメモリ上にありません（ログインし直すか、秘密鍵で追加してください）");
  }

  const used = appState.accounts
    .filter((a) => a.source === "mnemonic")
    .map((a) => a.accountIndex ?? 0);
  const nextIndex = used.length === 0 ? 0 : Math.max(...used) + 1;

  return await addAccountFromMnemonic(currentMnemonicPhrase, nextIndex, label);
}

async function addAccountFromPrivateKey(privateKeyHex, label) {
  const normalized = privateKeyHex.trim().toUpperCase().replace(/^0X/, "");
  if (!/^[0-9A-F]{64}$/.test(normalized)) {
    throw new Error("秘密鍵の形式が正しくありません（64桁の16進数を入力してください）");
  }

  if (isDuplicatePrivateKey(normalized)) {
    throw new Error("このアカウントはすでにインポートされています");
  }

  const id = crypto.randomUUID();
  const entry = {
    id,
    label: label?.trim() || "インポートした鍵",
    source: "privateKey",
    privateKeyHex: normalized,
    hidden: false,
  };
  upsertAccount(entry);
  await switchToAccount(id);
  return entry;
}

/* ============================================================
   アカウントの表示/非表示
============================================================ */
async function setAccountHidden(id, hidden) {
  const acc = appState.accounts.find((a) => a.id === id);
  if (!acc) return;
  acc.hidden = hidden;
  await persistAccounts();
}

/* ============================================================
   暗号化ボールト (パスワード設定時のみ使用)
   AES-GCM + PBKDF2(210,000回)でアカウント一覧を暗号化してlocalStorageへ
============================================================ */
async function deriveKeyFromPassword(password, saltBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 210000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

let sessionSalt = null;
let sessionKey = null;

/*
  ボールトの状態:
    "none"      … 何も保存されていない(ログアウト直後、または未設定)
    "encrypted" … パスワード設定済み。リロード後は必ずパスワード入力が必要

  ※ パスワードを設定しない「あとで設定」は廃止した。
    パスワードが設定されるまでは何も永続化しない(persistAccountsが無視する)ため、
    ページのリロードや意図しない終了があった場合、その時点でパスワード未設定なら
    アカウント作成からやり直しになる(＝毎回パスワード入力を必須にするため)。
*/
function getVaultMode() {
  const encRaw = localStorage.getItem(VAULT_KEY);
  if (encRaw) {
    try {
      if (JSON.parse(encRaw).encrypted) return "encrypted";
    } catch {
      /* ignore */
    }
  }
  return "none";
}

function hasVault() {
  return getVaultMode() !== "none";
}

function clearVault() {
  localStorage.removeItem(VAULT_KEY);
  sessionStorage.removeItem(VAULT_KEY); // 過去バージョンの平文保存が残っていた場合の掃除
  sessionSalt = null;
  sessionKey = null;
}

async function persistAccounts() {
  const persistable = appState.accounts;
  if (persistable.length === 0) return;

  // パスワード(暗号化キー)が未設定の間は何も永続化しない
  // (パスワード設定は必須のため、設定されるまでは保存しない)
  if (!sessionKey || !sessionSalt) return;

  const payload = {
    accounts: persistable,
    networkType: appState.networkType,
    activeAccountId: appState.activeAccountId,
  };

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sessionKey, plain);

  localStorage.setItem(
    VAULT_KEY,
    JSON.stringify({
      encrypted: true,
      salt: bufToBase64(sessionSalt),
      iv: bufToBase64(iv),
      cipher: bufToBase64(cipher),
    })
  );
}

function restoreAccountsPayload(payload) {
  appState.accounts = payload.accounts || [];
  appState.networkType = payload.networkType;

  const targetId =
    payload.activeAccountId && appState.accounts.some((a) => a.id === payload.activeAccountId)
      ? payload.activeAccountId
      : appState.accounts[0]?.id;

  if (!targetId) {
    throw new Error("保存されたアカウントがありません");
  }
  return targetId;
}

async function saveVault(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPassword(password, salt);
  sessionSalt = salt;
  sessionKey = key;
  await persistAccounts();
}


async function unlockVault(password) {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) {
    throw new Error("保存されたアカウントがありません");
  }

  const vault = JSON.parse(raw);
  const salt = base64ToBytes(vault.salt);
  const iv = base64ToBytes(vault.iv);
  const key = await deriveKeyFromPassword(password, salt);

  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(vault.cipher));
  } catch {
    throw new Error("パスワードが正しくありません");
  }

  const payload = JSON.parse(new TextDecoder().decode(plainBuf));

  sessionSalt = salt;
  sessionKey = key;

  const targetId = restoreAccountsPayload(payload);
  await switchToAccount(targetId);
}

/* ============================================================
   ローカル署名 (NIS1向け)
   NIS1の /transaction/announce は Symbol の /transactions と異なり、
   { data: <署名前のエンティティ hex>, signature: <署名 hex> } という
   2フィールド構成のJSONを要求する(Symbolのような単一payload方式ではない)。
   ※ このアプリでは NemFacade.signTransaction() で得た署名と、
     署名前のtxバイト列を組み合わせて announce 用JSONを組み立てる。
============================================================ */
function buildNemAnnouncePayload(tx) {
  const signature = appState.facade.signTransaction(appState.localKeyPair, tx);
  const dataHex = appState.sdkCore.utils.uint8ToHex(tx.serialize());
  const signatureBytes = signature.bytes ?? signature;
  const signatureHex = appState.sdkCore.utils.uint8ToHex(signatureBytes);

  return {
    jsonPayload: JSON.stringify({ data: dataHex, signature: signatureHex }),
    signature,
  };
}

function encryptMessageLocally(recipientPubKeyHex, plainText) {
  const encoder = new appState.sdkNem.MessageEncoder(appState.localKeyPair);
  const recipientPub = new appState.sdkCore.PublicKey(recipientPubKeyHex);
  return encoder.encode(recipientPub, new TextEncoder().encode(plainText));
}

/* ============================================================
   署名 → アナウンス（共通処理）
   送金・ハーベスト・ネームスペース登録・モザイク作成・マルチシグなど、
   トランザクションを送る全機能から共通で使う。
============================================================ */
async function signAndAnnounceTx(tx) {
  const { jsonPayload } = buildNemAnnouncePayload(tx);

  const res = await fetch(new URL("/transaction/announce", appState.NODE), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonPayload,
  });

  const result = await res.json();
  console.log("announce result:", result);

  // NIS1は code:1 (SUCCESS) 以外はエラー
  if (!res.ok || (result.code != null && result.code !== 1)) {
    throw new Error(result.message ?? "アナウンス失敗");
  }

  return appState.facade.hashTransaction(tx).toString();
}

/* ============================================================
   ログイン画面(パスワード入力画面)に戻る(保存データは削除しない)
   ログアウトと違い、パスワードで暗号化して保存済みのアカウント情報は
   そのまま残す。単に今のセッションを終了して、パスワード入力画面
   (保存データが無ければ、やむを得ずようこそ画面)に戻すだけの処理。
   実際にどちらの画面を表示するかは、呼び出し側で hasVault() を見て判断する。
============================================================ */
function returnToLoginScreen() {
  closeWebSocket();
  currentMnemonicPhrase = null;

  appState.authMode = null;
  appState.currentPubKey = null;
  appState.currentAddress = null;
  appState.localPrivateKeyHex = null;
  appState.localKeyPair = null;
  appState.NODE = null;
  appState.isSdkReady = false;
  appState.accounts = [];
  appState.activeAccountId = null;
  // appState.networkType はあえてクリアしない
  // (次のログイン時にネットワーク選択の手間を減らすため)
}

/* ============================================================
   ネットワーク切り替え(メインネット⇔テストネット)
   接続可能なHTTPS対応ノードが無い場合は何もせず false を返す
   (呼び出し側でアラート表示する想定)。
   同じ秘密鍵でも、ネットワークが変わるとアドレスの見た目が変わるため、
   全アカウントのアドレス表示を再計算してから保存し直す。
============================================================ */
async function switchNetwork(targetNetworkType) {
  const isTestnet = targetNetworkType === NetworkType.TESTNET;
  const node = await selectNode(isTestnet);
  if (!node) {
    return false;
  }

  closeWebSocket();

  appState.networkType = targetNetworkType;
  appState.NODE = node;
  appState.isSdkReady = false;
  await initSdk();

  // 保存済み全アカウントのアドレス表示を、新しいネットワークで再計算する
  for (const acc of appState.accounts) {
    if (!acc.privateKeyHex) continue;
    try {
      const keyPair = new appState.facade.static.KeyPair(
        new appState.sdkCore.PrivateKey(acc.privateKeyHex)
      );
      acc.address = appState.facade.network.publicKeyToAddress(keyPair.publicKey).toString();
    } catch (e) {
      console.warn("アドレス再計算失敗:", acc.id, e);
    }
  }

  if (appState.activeAccountId) {
    await switchToAccount(appState.activeAccountId);
  }

  return true;
}

/* ============================================================
   ログアウト
============================================================ */
function logout() {
  clearVault();
  closeWebSocket();
  currentMnemonicPhrase = null;

  appState.authMode = null;
  appState.currentPubKey = null;
  appState.currentAddress = null;
  appState.localPrivateKeyHex = null;
  appState.localKeyPair = null;
  appState.NODE = null;
  appState.isSdkReady = false;
  appState.networkType = null;
  appState.accounts = [];
  appState.activeAccountId = null;
}

/* ============================================================
   マルチシグ連署用の署名(NIS1の MultisigSignatureTransaction はそれ自体が
   独立したトランザクションであり、Symbolのように「ハッシュへの署名」だけを
   別送する仕組みではない。そのため multisig.js 側で
   MultisigSignatureTransaction を組み立てて signAndAnnounceTx で送信する)
============================================================ */

// ======================== transfer.js ========================
// transfer.js
// NEM (NIS1) 送金トランザクション
//
// ⚠️ 注意: NemFacadeのTransferTransactionディスクリプタのフィールド名は
//   Symbol版の実装(descriptors.TransferTransactionV1Descriptor(recipientAddress,
//   mosaics, message))に倣って推測実装している。実行前に一度、
//   ブラウザのコンソールで `appState.sdkNem.descriptors` の中身を確認し、
//   実際のクラス名・コンストラクタ引数と一致するか確認してください。

async function sendTx() {
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

  const recipientAddress = new appState.sdkNem.Address(normalizeAddress(recipientRaw));
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

// ======================== namespace.js ========================
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

/* ============================================================
   保有ネームスペース一覧
============================================================ */
async function loadOwnedNamespaces() {
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
async function populateParentNamespaceSelect() {
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
async function registerRootNamespace(name) {
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
async function registerChildNamespace(parentFqn, childName) {
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

// ======================== mosaic.js ========================
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

/* ============================================================
   保有ネームスペース候補の取得 (モザイクの作成先選択用)
============================================================ */
async function fetchOwnedNamespaceOptions() {
  const address = appState.currentAddress.toString();
  const res = await fetch(
    `${appState.NODE}/account/namespace/page?address=${encodeURIComponent(address)}&pageSize=100`
  );
  const json = await res.json();
  const items = json.data ?? [];
  return items.map((ns) => ({ id: ns.fqn, name: ns.fqn }));
}

async function fetchOwnedMosaicIds() {
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
async function loadOwnedMosaicsWithAlias() {
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
async function populateMosaicNamespaceSelect() {
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
async function createMosaic({
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

// ======================== supernode.js ========================
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

const SUPERNODE_MIN_XEM = 10010;

/* ============================================================
   参加条件(残高)の確認
============================================================ */
function checkSupernodeRequirements() {
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
async function fetchCodewordHash() {
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
async function submitEnrollTransaction({ nodeHost, enrollAddress, codewordHash }) {
  if (!nodeHost) throw new Error("ノードホストを入力してください");
  if (!enrollAddress) throw new Error("今月のエントリー用アドレスを入力してください");
  if (!codewordHash) throw new Error("コードワードハッシュを入力または取得してください");

  const { descriptors } = appState.sdkNem;

  const messageText = `enroll ${nodeHost} ${codewordHash}`;
  const message = {
    type: 1,
    payload: appState.sdkCore.utils.uint8ToHex(new TextEncoder().encode(messageText)),
  };

  const descriptor = new descriptors.TransferTransactionV1Descriptor(
    new appState.sdkNem.Address(normalizeAddress(enrollAddress)),
    0n, // メッセージのみ(XEM送金額は0)
    [],
    message
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  return await signAndAnnounceTx(tx);
}

// ======================== offlineTx.js ========================
// offlineTx.js
// オフライントランザクション機能
//
// 目的: 秘密鍵をオンライン環境から分離し、安全にトランザクションへ署名できる仕組み。
//
//   【オフライン環境】(高度機能 → オフライントランザクション。ログイン必須)
//     ・送金内容を作成
//     ・秘密鍵で署名(ネットワーク通信は一切行わない)
//     ・KASANE_OFFLINE_TX 形式のJSONファイルを書き出す
//
//   【オンライン環境】(ようこそ画面/ログイン画面。ログイン不要)
//     ・書き出されたJSONファイルを読み込む
//     ・内容を確認する
//     ・ノードへアナウンスのみ実行する(秘密鍵は一切扱わない)
//
// JSON形式:
// {
//   "type": "KASANE_OFFLINE_TX",
//   "version": 1,
//   "chain": "NEM",
//   "network": "MAIN_NET" | "TEST_NET",
//   "transactionType": "TRANSFER",
//   "payload": "...",        // 署名前のエンティティ(tx.serialize())のhex
//   "signature": "...",      // 署名のhex
//   "signerPublicKey": "...",
//   "hash": "..."
// }

const OFFLINE_TX_TYPE = "KASANE_OFFLINE_TX";
const OFFLINE_TX_VERSION = 1;

function networkTypeToLabel(networkType) {
  return networkType === NetworkType.TESTNET ? "TEST_NET" : "MAIN_NET";
}

/* ============================================================
   オフライン署名
   ログイン中のアカウント(この端末上の秘密鍵)でその場で署名し、
   KASANE_OFFLINE_TX形式のオブジェクトを作る。
   ※ この関数はネットワーク通信を一切行わない(ローカル署名のみ)。
============================================================ */
async function createSignedOfflineTx({ recipientAddress, amountXem, message }) {
  if (!appState.facade || !appState.currentPubKey || !appState.localKeyPair) {
    throw new Error("アカウントが未接続です(この端末でログインしている必要があります)");
  }
  if (!recipientAddress) {
    throw new Error("宛先アドレスを入力してください");
  }

  const amount = Number(amountXem);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("金額が不正です");
  }

  const { descriptors } = appState.sdkNem;

  const messageObj =
    message && message.trim() !== ""
      ? { type: 1, payload: appState.sdkCore.utils.uint8ToHex(new TextEncoder().encode(message)) }
      : { type: 0, payload: "" };

  const descriptor = new descriptors.TransferTransactionV1Descriptor(
    new appState.sdkNem.Address(normalizeAddress(recipientAddress)),
    BigInt(Math.floor(amount * 1_000_000)),
    [],
    messageObj
  );

  const tx = appState.facade.createTransactionFromTypedDescriptor(
    descriptor,
    appState.currentPubKey,
    appState.feeMultiplier ?? 1,
    60 * 60
  );

  // 署名のみ(アナウンスはしない)
  const signature = appState.facade.signTransaction(appState.localKeyPair, tx);
  const payloadHex = appState.sdkCore.utils.uint8ToHex(tx.serialize());
  const signatureBytes = signature.bytes ?? signature;
  const signatureHex = appState.sdkCore.utils.uint8ToHex(signatureBytes);
  const hash = appState.facade.hashTransaction(tx).toString();

  return {
    type: OFFLINE_TX_TYPE,
    version: OFFLINE_TX_VERSION,
    chain: "NEM",
    network: networkTypeToLabel(appState.networkType),
    transactionType: "TRANSFER",
    payload: payloadHex,
    signature: signatureHex,
    signerPublicKey: appState.currentPubKey,
    hash,
  };
}

/* ============================================================
   JSONファイルとしてダウンロードさせる
============================================================ */
function downloadOfflineTxJson(offlineTx) {
  const blob = new Blob([JSON.stringify(offlineTx, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `offline-tx-${(offlineTx.hash || "unsigned").slice(0, 16)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
   高度機能ページ側の読み込み欄用ガード。
   既に署名済み(signatureが入っている)のKASANE_OFFLINE_TXを
   誤ってここに読み込ませようとした場合は拒否する。
============================================================ */
function guardAgainstSignedOfflineTx(json) {
  if (json && json.type === OFFLINE_TX_TYPE && json.signature) {
    throw new Error("署名済みなので読み込めません");
  }
}

/* ============================================================
   オンライン側: ファイルの内容をJSONとしてパース・検証する
============================================================ */
function parseOfflineTxJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("JSONの形式が正しくありません");
  }

  if (json.type !== OFFLINE_TX_TYPE) {
    throw new Error(`対応していないファイル形式です(type: ${json.type ?? "不明"})`);
  }
  if (!json.payload || !json.signature) {
    throw new Error("署名データが不足しています(payload / signature が必要です)");
  }
  if (json.network !== "MAIN_NET" && json.network !== "TEST_NET") {
    throw new Error("networkの値が不正です(MAIN_NET または TEST_NET である必要があります)");
  }

  return json;
}

/* ============================================================
   オンライン側: ブロードキャスト先ノードを自動選択する
   (読み込んだJSONのnetworkに応じてHTTPS対応ノードを自動選定)
============================================================ */
async function selectNodeForOfflineTx(json) {
  const isTestnet = json.network === "TEST_NET";
  return await selectNode(isTestnet);
}

/* ============================================================
   オンライン側: ノードへアナウンスのみ実行する。
   ※ 秘密鍵・署名処理は一切行わない(読み込んだ署名データをそのまま送るだけ)。
============================================================ */
async function broadcastOfflineTx(json, nodeUrl) {
  const body = JSON.stringify({ data: json.payload, signature: json.signature });

  const res = await fetch(new URL("/transaction/announce", nodeUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const result = await res.json();
  if (!res.ok || (result.code != null && result.code !== 1)) {
    throw new Error(result.message ?? "アナウンスに失敗しました");
  }

  return json.hash;
}

// ======================== multisig.js ========================
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

/* ============================================================
   マルチシグ情報の取得
   NIS1の /account/get は meta.cosignatories / meta.cosignatoryOf /
   account.multisigInfo をまとめて返してくれるため、Symbolのように
   専用エンドポイントを叩く必要はない。
============================================================ */
async function loadMultisigInfo() {
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
async function fetchCosignatoryOfAddresses() {
  const address = appState.currentAddress.toString();
  const res = await fetch(`${appState.NODE}/account/get?address=${encodeURIComponent(address)}`);
  const json = await res.json();
  return (json.meta?.cosignatoryOf ?? []).map((c) => c.address);
}

/* ============================================================
   マルチシグ設定(自分自身のアカウントを対象)
   NEMは同意手続きが無く、直接署名・即アナウンスで完結する。
============================================================ */
async function updateMultisigSettings({
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
async function sendFromMultisig({ multisigAddress, recipientAddress, amountXem, message }) {
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

  const messageObj =
    message && message.trim() !== ""
      ? { type: 1, payload: appState.sdkCore.utils.uint8ToHex(new TextEncoder().encode(message)) }
      : { type: 0, payload: "" };

  const innerDescriptor = new descriptors.TransferTransactionV1Descriptor(
    new appState.sdkNem.Address(recipientAddress),
    BigInt(Math.floor(amountXem * 1_000_000)),
    [],
    messageObj
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
async function loadPendingPartialTransactions() {
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

async function cosignPending(transactionHashHex, multisigAddress) {
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

// ======================== harvest.js ========================
// harvest.js
// 委任ハーベスティング (Delegated / Remote Harvesting) — NEM(NIS1)版
//
// NEMの委任ハーベストはSymbolよりずっとシンプル:
//   ① ImportanceTransferTransaction(mode: ACTIVATE) で
//      「リモートアカウント」を1つ指定し、自分の重要度(importance)を委任する
//      (Symbolのような VRF鍵/ノード鍵リンクや PersistentDelegationRequest は不要)
//   ② 委任先ノードに対して、そのリモートアカウントの秘密鍵を
//      POST /account/unlock で伝え、そのノードにハーベストを代行してもらう
//      (ノードを自分で信頼する必要がある。悪意あるノードには渡さないこと)
//
// 解除は同トランザクションを mode: DEACTIVATE で送るだけ。
//
// ⚠️ ImportanceTransferTransactionディスクリプタの引数は
//   Symbol版実装のパターンから類推している。実行前に
//   `appState.sdkNem.descriptors` の内容を確認してください。

/* ============================================================
   委任先ノード候補の読み込み(現在接続中ノードのピア一覧から)
============================================================ */
async function loadHarvestNodeCandidates() {
  const select = document.getElementById("harvest-node-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- 候補を読み込み中... --</option>`;

  try {
    const peers = await fetchReachablePeers(appState.NODE);

    if (peers.length === 0) {
      select.innerHTML = `<option value="">-- 候補が見つかりません(下に直接URLを入力してください) --</option>`;
      return;
    }

    select.innerHTML =
      `<option value="">-- ノードを選択（未選択なら接続中ノードを使用）--</option>` +
      peers.map((url) => `<option value="${url}">${url}</option>`).join("");
  } catch (e) {
    console.warn("ノード候補の取得に失敗しました", e);
    select.innerHTML = `<option value="">-- 候補の取得に失敗（下に直接URLを入力してください）--</option>`;
  }
}

function getSelectedHarvestNodeUrl() {
  const manual = document.getElementById("harvest-node-input")?.value?.trim();
  if (manual) return manual;

  const selected = document.getElementById("harvest-node-select")?.value?.trim();
  if (selected) return selected;

  return appState.NODE;
}

/* ============================================================
   直近生成したリモート鍵（セッション内のみ保持）
   委任解除の際に使う。リロードすると消えるため、画面にも控えてもらう。
============================================================ */
let lastRemoteKeys = null;

function toHex(bytesOrKey) {
  const bytes = bytesOrKey.bytes ?? bytesOrKey;
  return appState.sdkCore.utils.uint8ToHex(bytes);
}

/* ============================================================
   ハーベスト状態確認
============================================================ */
async function checkHarvestStatus() {
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
    const res = await fetch(`${appState.NODE}/account/get?address=${encodeURIComponent(address)}`);
    const json = await res.json();
    const account = json.account;
    const meta = json.meta;

    if (!account) {
      statusEl.textContent = "アカウント情報取得失敗";
      setBadge("inactive", "❌ アカウント未登録");
      return;
    }

    const importance = account.importance ?? 0;
    if (importanceEl) importanceEl.textContent = importance.toString();

    // remoteStatus: "ACTIVE"(委任中) / "ACTIVATING" / "INACTIVE" / "DEACTIVATING" / "REMOTE"(自分がリモート役)
    const remoteStatus = meta?.remoteStatus ?? "INACTIVE";

    if (remoteStatus === "ACTIVE") {
      setBadge("active", "✅ 委任ハーベスティング設定済み");
    } else if (remoteStatus === "ACTIVATING" || remoteStatus === "DEACTIVATING") {
      setBadge("partial", `⚠️ 反映待ち (${remoteStatus})`);
    } else {
      setBadge("inactive", "❌ 委任ハーベスティング未設定");
    }

    statusEl.textContent = `重要度: ${importance} / remoteStatus: ${remoteStatus} / harvestedBlocks: ${account.harvestedBlocks ?? 0}`;
  } catch (e) {
    console.error("Harvest status error:", e);
    statusEl.textContent = "状態取得エラー";
    setBadge("inactive", "❌ 状態取得エラー");
  }
}

/* ============================================================
   トランザクション確認待ち
   NIS1には /transactionStatus/{hash} のようなAPIが無いため、
   「未承認一覧から消えたら承認されたとみなす」簡易実装にしている。
============================================================ */
async function waitConfirmed(hash, address, { timeoutMs = 90000, intervalMs = 4000 } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(
        `${appState.NODE}/account/unconfirmedTransactions?address=${encodeURIComponent(address)}`
      );
      const json = await res.json();
      const items = json.data ?? [];
      const stillPending = items.some((item) => {
        const h = item.meta?.hash?.data ?? item.meta?.hash;
        return h === hash;
      });
      if (!stillPending) return true;
    } catch (e) {
      console.warn("waitConfirmed polling error:", e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("承認待ちがタイムアウトしました(ネットワーク混雑時はもう少しお待ちください)");
}

/* ============================================================
   ハーベスト(ハーベスト)履歴
   NIS1: GET /account/harvests?address=
============================================================ */
async function loadHarvestHistory() {
  const el = document.getElementById("harvest-history");
  if (!el) return;

  el.textContent = "読み込み中...";

  try {
    if (!appState.NODE || !appState.currentAddress) {
      throw new Error("アカウント未接続です");
    }

    const address = appState.currentAddress.toString();
    const res = await fetch(`${appState.NODE}/account/harvests?address=${encodeURIComponent(address)}`);
    const json = await res.json();
    const items = json.data ?? [];

    if (items.length === 0) {
      el.innerHTML = `<div>ハーベスト履歴はありません</div>`;
      return;
    }

    el.innerHTML = items
      .slice(0, 10)
      .map((h) => {
        const feeXem = h.totalFee
          ? (Number(h.totalFee) / 1_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 6 })
          : "0";

        return `
          <div class="harvest-history-item">
            <div>高さ: ${h.height}</div>
            <div>獲得手数料(概算): ${feeXem} XEM</div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error("loadHarvestHistory error:", e);
    el.textContent = "履歴取得エラー";
  }
}

/* ============================================================
   委任ハーベスティング開始
============================================================ */
async function startHarvest() {
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
    if (!isHttpsUrl(harvestNodeUrl)) {
      throw new Error("委任先ノードはHTTPS対応ノードのみ指定できます(http://は不可)");
    }

    setLine("リモートアカウントの鍵を生成中...");
    const remotePrivateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const remotePrivateKey = new appState.sdkCore.PrivateKey(remotePrivateKeyBytes);
    const remoteKeyPair = new appState.facade.static.KeyPair(remotePrivateKey);

    lastRemoteKeys = {
      remotePrivateKey: toHex(remotePrivateKey),
      remotePublicKey: remoteKeyPair.publicKey.toString(),
    };
    console.warn(
      "生成したリモートアカウントの秘密鍵（この画面を閉じると失われます。解除の際に必要な場合があるため控えてください）:",
      lastRemoteKeys
    );

    const { descriptors, models } = appState.sdkNem;

    setLine("① ImportanceTransferTransaction(ACTIVATE)を署名しています...");
    const descriptor = new descriptors.ImportanceTransferTransactionV1Descriptor(
      models.ImportanceTransferMode.ACTIVATE,
      remoteKeyPair.publicKey
    );
    const tx = appState.facade.createTransactionFromTypedDescriptor(
      descriptor,
      appState.currentPubKey,
      appState.feeMultiplier ?? 1,
      60 * 60
    );

    const hash = await signAndAnnounceTx(tx);
    setLine(`委任Tx送信済み (${hash.slice(0, 12)}...) 承認待ち...`);

    const address = appState.currentAddress.toString();
    await waitConfirmed(hash, address);
    setLine("委任Tx承認完了。② ノードにリモート鍵をアンロック依頼します...");

    const unlockRes = await fetch(new URL("/account/unlock", harvestNodeUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privateKey: lastRemoteKeys.remotePrivateKey }),
    });

    if (!unlockRes.ok) {
      const errJson = await unlockRes.json().catch(() => ({}));
      throw new Error(
        `ノードへのアンロック依頼に失敗しました: ${errJson.message ?? unlockRes.status}`
      );
    }

    setLine("✅ 委任ハーベスティングの設定が完了しました");
    alert(
      "委任ハーベスティングの設定が完了しました。\n" +
      "ノードが受け付けていれば、まもなくハーベストが始まります。\n" +
      "（ノードを再起動するとアンロック状態が解除される場合があります）"
    );
    await checkHarvestStatus();
  } catch (e) {
    console.error("startHarvest error:", e);
    setLine("❌ ハーベスト設定失敗: " + e.message);
    alert("ハーベスト設定失敗: " + e.message);
  }
}

/* ============================================================
   委任解除（Unlink）
   セッション内に直近生成したリモート鍵があればその公開鍵を使う。
   無い場合(リロード後など)は解除対象を特定できないため、
   手動でリモート公開鍵を入力してもらう。
============================================================ */
async function stopHarvest() {
  const statusEl = document.getElementById("harvest-status");
  const setLine = (text) => {
    if (statusEl) statusEl.textContent = text;
    console.log("[harvest]", text);
  };

  try {
    if (!appState.facade || !appState.currentPubKey) {
      throw new Error("SDK未初期化またはアカウント未接続です");
    }

    let remotePublicKeyHex = lastRemoteKeys?.remotePublicKey;

    if (!remotePublicKeyHex) {
      remotePublicKeyHex = prompt(
        "このセッションで委任した記録が見つかりませんでした。\n" +
        "解除するリモートアカウントの公開鍵を入力してください\n" +
        "（委任開始時にコンソールへ出力・表示された remotePublicKey です）："
      );
      if (!remotePublicKeyHex) {
        setLine("解除をキャンセルしました");
        return;
      }
    }

    if (!confirm(`リモート公開鍵 ${remotePublicKeyHex} の委任を解除します。よろしいですか？`)) {
      setLine("解除をキャンセルしました");
      return;
    }

    const { descriptors, models } = appState.sdkNem;

    setLine("解除トランザクションを署名しています...");
    const descriptor = new descriptors.ImportanceTransferTransactionV1Descriptor(
      models.ImportanceTransferMode.DEACTIVATE,
      new appState.sdkCore.PublicKey(remotePublicKeyHex)
    );
    const tx = appState.facade.createTransactionFromTypedDescriptor(
      descriptor,
      appState.currentPubKey,
      appState.feeMultiplier ?? 1,
      60 * 60
    );

    const hash = await signAndAnnounceTx(tx);
    setLine(`解除Tx送信済み (${hash.slice(0, 12)}...) 承認待ち...`);

    const address = appState.currentAddress.toString();
    await waitConfirmed(hash, address);

    lastRemoteKeys = null;
    setLine("✅ 委任ハーベスティングを解除しました");
    await checkHarvestStatus();
    alert("委任ハーベスティングの解除が完了しました。");
  } catch (e) {
    console.error("stopHarvest error:", e);
    setLine("❌ 解除失敗: " + e.message);
    alert("解除失敗: " + e.message);
  }
}

// ======================== settings.js ========================
// settings.js
// 設定メニュー: 接続先ノードの変更 (NIS1版)
// ※ 送金手数料の設定機能は廃止した(常にappState.feeMultiplierの既定値=1を使用)

/* ============================================================
   接続先ノードの変更
============================================================ */

function showCurrentNode() {
  const el = document.getElementById("current-node-display");
  if (el) el.textContent = appState.NODE ?? "---";
}

async function loadNodeSettingsCandidates() {
  const select = document.getElementById("node-settings-select");
  if (!select) return;

  select.innerHTML = `<option value="">-- 候補を読み込み中... --</option>`;

  try {
    const peers = await fetchReachablePeers(appState.NODE);

    if (peers.length === 0) {
      select.innerHTML = `<option value="">-- 候補が見つかりません(下に直接URLを入力してください) --</option>`;
      return;
    }

    select.innerHTML =
      `<option value="">-- ノードを選択 --</option>` +
      peers.map((url) => `<option value="${url}">${url}</option>`).join("");
  } catch (e) {
    console.warn("ノード候補の取得に失敗しました", e);
    select.innerHTML = `<option value="">-- 候補の取得に失敗（下に直接URLを入力してください）--</option>`;
  }
}

function getSelectedNodeUrl() {
  const manual = document.getElementById("node-settings-input")?.value?.trim();
  if (manual) return manual;

  const selected = document.getElementById("node-settings-select")?.value?.trim();
  if (selected) return selected;

  return "";
}

async function applyNodeChange() {
  const targetRaw = getSelectedNodeUrl();

  if (!targetRaw) {
    setStatus("node-settings-status", "ノードを選択するかURLを入力してください。", "error");
    return;
  }

  let targetOrigin;
  try {
    const u = new URL(targetRaw);
    if (u.protocol !== "https:") {
      setStatus(
        "node-settings-status",
        "このアプリはHTTPS対応ノードにのみ接続できます(http://は指定できません)。",
        "error"
      );
      return;
    }
    targetOrigin = u.origin;
  } catch {
    setStatus("node-settings-status", "ノードURLの形式が正しくありません。", "error");
    return;
  }

  setStatus("node-settings-status", `接続確認中... (${targetOrigin})`);

  try {
    // NIS1には /network/properties のようなネットワーク自己申告APIが無いため、
    // ここでは「応答するかどうか」のみ確認する。
    // Mainnet/Testnetを取り違えたノードを選ばないよう、ご自身でご注意ください。
    const res = await fetch(new URL("/chain/height", targetOrigin));
    if (!res.ok) throw new Error("応答がありません");

    closeWebSocket();
    appState.NODE = targetOrigin;

    await initSdk();
    await refreshAccount();
    await loadRecentTx();

    if (appState.currentAddress) {
      const address = appState.currentAddress.toString();
      initWebSocket(address);
      initLiveTx(address);
    }

    const isTestnet = appState.networkType === NetworkType.TESTNET;
    const infoEl = document.getElementById("node-info");
    if (infoEl) {
      infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: true });
    }
    showCurrentNode();

    setStatus("node-settings-status", "✅ ノードを切り替えました。", "success");
  } catch (e) {
    console.error("applyNodeChange error:", e);
    setStatus("node-settings-status", "ノードへの接続に失敗しました。", "error");
  }
}

// ======================== accountSwitcher.js ========================
// accountSwitcher.js
// アカウント切替・非表示リストの描画

function shortAddr(addr) {
  if (!addr) return "---";
  return addr.length > 16 ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : addr;
}

function sourceLabel(source) {
  if (source === "mnemonic") return "ニーモニック由来";
  if (source === "privateKey") return "秘密鍵インポート";
  return source;
}

function updateSwitcherVisibility() {
  const btn = document.getElementById("account-switch-btn");
  if (!btn) return;
  btn.style.display = appState.accounts.length > 0 ? "inline-flex" : "none";
}

/* ============================================================
   アカウント切替画面の一覧(非表示のものは出さない)
============================================================ */
function renderAccountSwitcherList() {
  const el = document.getElementById("account-switcher-list");
  if (!el) return;

  const visible = appState.accounts.filter((a) => !a.hidden);

  if (visible.length === 0) {
    el.innerHTML = `<div style="color:#94a3b8;">表示できるアカウントがありません（非表示のアカウントを管理から確認できます）</div>`;
    return;
  }

  el.innerHTML = visible
    .map(
      (a) => `
    <div class="account-row ${a.id === appState.activeAccountId ? "active" : ""}">
      <div class="account-row-main" data-action="switch" data-id="${a.id}">
        <div class="account-row-label">${a.label}${a.id === appState.activeAccountId ? " ✅" : ""}</div>
        <div class="account-row-sub">${sourceLabel(a.source)} ・ ${shortAddr(a.address)}</div>
      </div>
      <button class="account-hide-btn" data-action="hide" data-id="${a.id}">非表示</button>
    </div>
  `
    )
    .join("");
}

/* ============================================================
   非表示アカウント一覧(再表示ボタン付き)
============================================================ */
function renderHiddenAccountList() {
  const el = document.getElementById("hidden-account-list");
  if (!el) return;

  const hidden = appState.accounts.filter((a) => a.hidden);

  if (hidden.length === 0) {
    el.innerHTML = `<div style="color:#94a3b8;">非表示のアカウントはありません</div>`;
    return;
  }

  el.innerHTML = hidden
    .map(
      (a) => `
    <div class="account-row">
      <div class="account-row-main">
        <div class="account-row-label">${a.label}</div>
        <div class="account-row-sub">${sourceLabel(a.source)} ・ ${shortAddr(a.address)}</div>
      </div>
      <button class="account-hide-btn" data-action="unhide" data-id="${a.id}">再表示</button>
    </div>
  `
    )
    .join("");
}

/* ============================================================
   ニーモニックで追加する際の、未使用アカウントインデックス候補
============================================================ */
function nextMnemonicAccountIndex() {
  const used = appState.accounts
    .filter((a) => a.source === "mnemonic")
    .map((a) => a.accountIndex ?? 0);
  if (used.length === 0) return 0;
  return Math.max(...used) + 1;
}

// ======================== QRCode (遅延読み込み) ========================
let _qrCodeModulePromise = null;
function loadQRCode() {
  if (!_qrCodeModulePromise) {
    _qrCodeModulePromise = import("https://esm.sh/qrcode").then((m) => m.default || m);
  }
  return _qrCodeModulePromise;
}

// ======================== index.js ========================
// index.js

window.addEventListener("load", async () => {
  // ============================
  // ページ取得
  // ============================
  const welcomePage = document.getElementById("welcome-page");
  const mnemonicImportPage = document.getElementById("mnemonic-import-page");
  const createNewPage = document.getElementById("create-new-page");
  const passwordSetupPage = document.getElementById("password-setup-page");
  const unlockPage = document.getElementById("unlock-page");
  const accountPage = document.getElementById("account-page");
  const sendPage = document.getElementById("send-page");
  const transferPage = document.getElementById("transfer-page");
  const receivePage = document.getElementById("receive-page");
  const harvestPage = document.getElementById("harvest-page");
  const settingsPage = document.getElementById("settings-page");
  const networkSettingsPage = document.getElementById("network-settings-page");
  const nodeSettingsPage = document.getElementById("node-settings-page");
  const accountSwitcherPage = document.getElementById("account-switcher-page");
  const hiddenAccountsPage = document.getElementById("hidden-accounts-page");
  const addAccountMnemonicPage = document.getElementById("add-account-mnemonic-page");
  const addAccountPrivatekeyPage = document.getElementById("add-account-privatekey-page");
  const advancedPage = document.getElementById("advanced-page");
  const namespacePage = document.getElementById("namespace-page");
  const mosaicPage = document.getElementById("mosaic-page");
  const supernodePage = document.getElementById("supernode-page");
  const offlineTxPage = document.getElementById("offline-tx-page");
  const offlineTxBroadcastPage = document.getElementById("offline-tx-broadcast-page");
  const multisigMenuPage = document.getElementById("multisig-menu-page");
  const multisigSettingsPage = document.getElementById("multisig-settings-page");
  const multisigSendPage = document.getElementById("multisig-send-page");
  const multisigSignPage = document.getElementById("multisig-sign-page");

  // ============================
  // ページ切替
  // ============================
  function showPage(page) {
    document.querySelectorAll(".page").forEach(p => {
      p.classList.remove("active");
    });
    page.classList.add("active");
  }

  function goHome() {
    updateSwitcherVisibility();
    showPage(accountPage);
  }

  // ============================
  // 起動時の初期画面判定
  // パスワード設定は必須のため、保存済みアカウントがあれば
  // 必ずパスワード入力画面を表示する(自動ログインはしない)
  // ============================
  if (hasVault()) {
    showPage(unlockPage);
  } else {
    showPage(welcomePage);
  }

  // ============================
  // ニーモニックインポート画面へ / 新規作成画面へ
  // (ウェルカム画面はニーモニック関連の選択肢のみ。SSS Extensionは非対応)
  // ============================
  document.getElementById("choose-mnemonic")?.addEventListener("click", () => {
    showPage(mnemonicImportPage);
  });

  document.getElementById("back-welcome-mnemonic")?.addEventListener("click", () => showPage(welcomePage));

  document.getElementById("import-mnemonic-btn")?.addEventListener("click", async () => {
    const mnemonicPhrase = document.getElementById("mnemonic-input").value.trim();
    const networkChoice = document.getElementById("mnemonic-network-select").value;
    const networkType = networkChoice === "testnet" ? NetworkType.TESTNET : NetworkType.MAINNET;

    if (!mnemonicPhrase) {
      setStatus("mnemonic-import-status", "ニーモニックを入力してください。", "error");
      return;
    }

    setStatus("mnemonic-import-status", "インポート中...");
    try {
      await loginWithMnemonic(mnemonicPhrase, networkType);
      document.getElementById("mnemonic-input").value = "";
      setStatus("mnemonic-import-status", "", "default");
      showPage(passwordSetupPage);
    } catch (e) {
      console.error("loginWithMnemonic error:", e);
      setStatus("mnemonic-import-status", e.message || "インポートに失敗しました。", "error");
      alert(e.message || "ノードに接続できません");
    }
  });

  // ============================
  // 新規作成画面
  // ============================
  let generatedMnemonicPhrase = null;

  document.getElementById("choose-create-new")?.addEventListener("click", () => {
    generatedMnemonicPhrase = null;
    document.getElementById("generated-mnemonic-area").style.display = "none";
    document.getElementById("generated-mnemonic-display").textContent = "";
    setStatus("create-new-status", "", "default");
    showPage(createNewPage);
  });

  document.getElementById("back-welcome-create-new")?.addEventListener("click", () => showPage(welcomePage));

  document.getElementById("generate-mnemonic-btn")?.addEventListener("click", async () => {
    setStatus("create-new-status", "生成中...");
    try {
      generatedMnemonicPhrase = await generateNewMnemonic();
      document.getElementById("generated-mnemonic-display").textContent = generatedMnemonicPhrase;
      document.getElementById("generated-mnemonic-area").style.display = "block";
      setStatus("create-new-status", "", "default");
    } catch (e) {
      console.error("generateNewMnemonic error:", e);
      setStatus("create-new-status", e.message || "生成に失敗しました。", "error");
    }
  });

  document.getElementById("create-new-next-btn")?.addEventListener("click", async () => {
    if (!generatedMnemonicPhrase) return;

    const recorded = confirm("記録しましたか？");
    if (!recorded) return;

    const networkChoice = document.getElementById("create-new-network-select").value;
    const networkType = networkChoice === "testnet" ? NetworkType.TESTNET : NetworkType.MAINNET;

    setStatus("create-new-status", "作成中...");
    try {
      await loginWithMnemonic(generatedMnemonicPhrase, networkType);
      generatedMnemonicPhrase = null;
      document.getElementById("generated-mnemonic-display").textContent = "";
      document.getElementById("generated-mnemonic-area").style.display = "none";
      setStatus("create-new-status", "", "default");
      showPage(passwordSetupPage);
    } catch (e) {
      console.error("loginWithMnemonic (create-new) error:", e);
      setStatus("create-new-status", e.message || "作成に失敗しました。", "error");
      alert(e.message || "ノードに接続できません");
    }
  });

  // ============================
  // パスワード設定(任意)
  // ============================
  document.getElementById("save-password-btn")?.addEventListener("click", async () => {
    const pw = document.getElementById("setup-password-input").value;
    const pwConfirm = document.getElementById("setup-password-confirm").value;

    if (!pw || pw.length < 8) {
      setStatus("password-setup-status", "8文字以上のパスワードを入力してください。", "error");
      return;
    }
    if (pw !== pwConfirm) {
      setStatus("password-setup-status", "パスワードが一致しません。", "error");
      return;
    }

    try {
      await saveVault(pw);
      document.getElementById("setup-password-input").value = "";
      document.getElementById("setup-password-confirm").value = "";
      goHome();
    } catch (e) {
      console.error("saveVault error:", e);
      setStatus("password-setup-status", "保存に失敗しました。", "error");
    }
  });

  // ============================
  // ロック解除(保存済みアカウントでログイン)
  // ============================
  document.getElementById("unlock-btn")?.addEventListener("click", async () => {
    const pw = document.getElementById("unlock-password-input").value;
    if (!pw) {
      setStatus("unlock-status", "パスワードを入力してください。", "error");
      return;
    }
    setStatus("unlock-status", "ログイン中...");
    try {
      await unlockVault(pw);
      document.getElementById("unlock-password-input").value = "";
      goHome();
    } catch (e) {
      console.error("unlockVault error:", e);
      setStatus("unlock-status", e.message || "ログインに失敗しました。", "error");
    }
  });

  document.getElementById("forget-account-btn")?.addEventListener("click", () => {
    if (!confirm(
      "この端末に保存されているアカウント情報を削除します。\n" +
      "（ニーモニックや秘密鍵をメモ・保管していれば、資産自体がなくなることはありません。このアプリからのログイン情報が消えるだけです）\n\n" +
      "削除してよろしいですか？"
    )) return;
    clearVault();
    showPage(welcomePage);
  });

  // 送金画面に「保有トークン一覧」から直接入ったかどうか
  let cameFromMosaicList = false;
  const backSendBtn = document.getElementById("back-send");

  // ============================
  // 送金画面
  // ============================
  document.getElementById("send-btn")?.addEventListener("click", () => {
    showPage(sendPage);
    const sendList = document.getElementById("send-mosaic-list");
    const mosaicList = document.getElementById("mosaic-list");

    if (sendList && mosaicList) {
      sendList.innerHTML = mosaicList.innerHTML;
    }
  });

  // ============================
  // モザイク選択
  // ============================
  document.getElementById("send-mosaic-list")?.addEventListener("click", e => {
    const item = e.target.closest(".mosaic-item");
    if (!item) return;

    document.getElementById("selected-mosaic-name").textContent =
      item.querySelector(".mosaic-name")?.textContent;

    document.getElementById("selected-mosaic-id").value =
      item.querySelector(".mosaic-id")?.textContent;

    cameFromMosaicList = false;
    if (backSendBtn) backSendBtn.textContent = "← トークン選択へ戻る";
    showPage(transferPage);
  });

  // ============================
  // 保有トークン一覧から直接送金画面へ
  // ============================
  document.getElementById("mosaic-list")?.addEventListener("click", e => {
    const item = e.target.closest(".mosaic-item");
    if (!item) return;

    cameFromMosaicList = true;
    if (backSendBtn) backSendBtn.textContent = "← 戻る";
    showPage(transferPage);
  });

  // ============================
  // 送金実行
  // ============================
  document.getElementById("btn-transfer")?.addEventListener("click", sendTx);

  // ============================
  // 受取画面
  // ============================
  document.getElementById("receive-btn")?.addEventListener("click", async () => {
    showPage(receivePage);
    const address = appState.currentAddress.toString();

    document.getElementById("receive-address").textContent = address;
    const qr = document.getElementById("receive-qrcode");
    qr.innerHTML = "読み込み中...";

    // NEM(NIS1)公式ウォレット向けのQR仕様はSymbolの symbol-qr-library とは異なるため、
    // ここではシンプルにアドレス文字列そのもののQRコードを表示する。
    try {
      const QRCode = await loadQRCode();
      const dataUrl = await QRCode.toDataURL(address, { width: 220, margin: 1 });
      qr.innerHTML = `<img src="${dataUrl}" alt="QR Code">`;
    } catch (e) {
      console.error("QRコード生成失敗", e);
      qr.innerHTML = "QRコードの生成に失敗しました";
    }
  });

  // ============================
  // 受け取りアドレスコピー
  // ============================
  document.getElementById("copy-receive-address")?.addEventListener("click", () => {
    navigator.clipboard.writeText(appState.currentAddress.toString());
    showPopup("アドレスをコピーしました");
  });

  // ============================
  // ハーベスト画面
  // ============================
  document.getElementById("harvest-btn")?.addEventListener("click", async () => {
    showPage(harvestPage);
    const address = appState.currentAddress.toString();
    document.getElementById("harvest-address").textContent = address;

    await checkHarvestStatus();
    await loadHarvestNodeCandidates();
    await loadHarvestHistory();
  });

  document.getElementById("start-harvest-btn")?.addEventListener("click", startHarvest);
  document.getElementById("stop-harvest-btn")?.addEventListener("click", stopHarvest);

  // ============================
  // 高度機能
  // ============================
  document.getElementById("advanced-btn")?.addEventListener("click", () => {
    showPage(advancedPage);
  });

  document.getElementById("menu-namespace")?.addEventListener("click", async () => {
    showPage(namespacePage);
    await loadOwnedNamespaces();
    await populateParentNamespaceSelect();
  });

  document.getElementById("menu-mosaic")?.addEventListener("click", async () => {
    showPage(mosaicPage);
    await loadOwnedMosaicsWithAlias();
    await populateMosaicNamespaceSelect();
  });

  // ============================
  // スーパーノード構築設定
  // ============================
  document.getElementById("menu-supernode")?.addEventListener("click", () => {
    showPage(supernodePage);
    checkSupernodeRequirements();
    setStatus("supernode-codeword-status", "", "default");
    setStatus("supernode-enroll-status", "", "default");
  });

  document.getElementById("back-advanced-supernode")?.addEventListener("click", () => showPage(advancedPage));

  document.getElementById("fetch-codeword-btn")?.addEventListener("click", fetchCodewordHash);

  document.getElementById("submit-enroll-btn")?.addEventListener("click", async () => {
    const nodeHost = document.getElementById("supernode-node-host").value.trim();
    const enrollAddress = document.getElementById("supernode-enroll-address").value.trim();
    const codewordHash = document.getElementById("supernode-codeword").value.trim();

    setStatus("supernode-enroll-status", "送信中...");
    try {
      const hash = await submitEnrollTransaction({ nodeHost, enrollAddress, codewordHash });
      setStatus("supernode-enroll-status", `✅ エントリーを送信しました。Hash: ${hash}`, "success");
    } catch (e) {
      console.error("submitEnrollTransaction error:", e);
      setStatus("supernode-enroll-status", e.message || "送信に失敗しました。", "error");
    }
  });

  // ============================
  // オフライントランザクション(署名: 高度機能内。ログイン必須)
  // ============================
  document.getElementById("menu-offline-tx")?.addEventListener("click", () => {
    showPage(offlineTxPage);
    setStatus("offline-tx-create-status", "", "default");
  });

  document.getElementById("back-advanced-offline-tx")?.addEventListener("click", () => showPage(advancedPage));

  document.getElementById("create-offline-tx-btn")?.addEventListener("click", async () => {
    const recipientAddress = document.getElementById("offline-tx-recipient").value.trim();
    const amountXem = document.getElementById("offline-tx-amount").value;
    const message = document.getElementById("offline-tx-message").value;

    setStatus("offline-tx-create-status", "署名中...(ネットワーク通信は行いません)");
    try {
      const offlineTx = await createSignedOfflineTx({ recipientAddress, amountXem, message });
      downloadOfflineTxJson(offlineTx);
      setStatus(
        "offline-tx-create-status",
        `✅ 署名しました。ファイルを書き出しました。Hash: ${offlineTx.hash}`,
        "success"
      );
    } catch (e) {
      console.error("createSignedOfflineTx error:", e);
      setStatus("offline-tx-create-status", e.message || "署名に失敗しました。", "error");
    }
  });

  document.getElementById("offline-tx-guard-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      guardAgainstSignedOfflineTx(json);
    } catch (err) {
      alert(err.message || "ファイルの読み込みに失敗しました。");
    } finally {
      e.target.value = "";
    }
  });

  // ============================
  // オフライントランザクション(ブロードキャスト: ようこそ/ログイン画面。ログイン不要)
  // ============================
  let offlineTxOriginPage = null;
  let pendingOfflineTx = null;
  let pendingOfflineTxNode = null;

  function wireOfflineTxLoader(buttonId, fileInputId, originPage) {
    const btn = document.getElementById(buttonId);
    const fileInput = document.getElementById(fileInputId);
    if (!btn || !fileInput) return;

    btn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      try {
        const text = await file.text();
        const json = parseOfflineTxJson(text);

        offlineTxOriginPage = originPage;
        pendingOfflineTx = json;

        const detailsEl = document.getElementById("offline-tx-details");
        if (detailsEl) {
          detailsEl.innerHTML = `
            <div>チェーン: ${json.chain}</div>
            <div>ネットワーク: ${json.network === "TEST_NET" ? "Testnet" : "Mainnet"}</div>
            <div>種別: ${json.transactionType}</div>
            <div>送信元公開鍵: ${json.signerPublicKey}</div>
            <div>Hash: ${json.hash}</div>
          `;
        }

        const nodeDisplay = document.getElementById("offline-tx-node-display");
        if (nodeDisplay) nodeDisplay.textContent = "ノードを検索中...";
        setStatus("offline-tx-broadcast-status", "", "default");
        showPage(offlineTxBroadcastPage);

        pendingOfflineTxNode = await selectNodeForOfflineTx(json);
        if (nodeDisplay) {
          nodeDisplay.textContent = pendingOfflineTxNode || "(接続可能なHTTPS対応ノードが見つかりませんでした)";
        }
      } catch (err) {
        console.error("offline tx load error:", err);
        alert(err.message || "ファイルの読み込みに失敗しました。");
      }
    });
  }

  wireOfflineTxLoader("welcome-load-offline-tx-btn", "welcome-offline-tx-file", welcomePage);
  wireOfflineTxLoader("unlock-load-offline-tx-btn", "unlock-offline-tx-file", unlockPage);

  document.getElementById("back-offline-broadcast")?.addEventListener("click", () => {
    pendingOfflineTx = null;
    pendingOfflineTxNode = null;
    showPage(offlineTxOriginPage || welcomePage);
  });

  document.getElementById("broadcast-offline-tx-btn")?.addEventListener("click", async () => {
    if (!pendingOfflineTx) return;
    if (!pendingOfflineTxNode) {
      alert("ノードに接続できません");
      return;
    }

    setStatus("offline-tx-broadcast-status", "送信中...");
    try {
      const hash = await broadcastOfflineTx(pendingOfflineTx, pendingOfflineTxNode);
      setStatus("offline-tx-broadcast-status", `✅ ブロードキャストしました。Hash: ${hash}`, "success");
    } catch (e) {
      console.error("broadcastOfflineTx error:", e);
      setStatus("offline-tx-broadcast-status", e.message || "ブロードキャストに失敗しました。", "error");
    }
  });

  // ============================
  // マルチシグ
  // ============================
  document.getElementById("menu-multisig")?.addEventListener("click", () => {
    showPage(multisigMenuPage);
  });

  document.getElementById("menu-multisig-settings")?.addEventListener("click", async () => {
    showPage(multisigSettingsPage);
    await loadMultisigInfo();
  });

  document.getElementById("menu-multisig-send")?.addEventListener("click", async () => {
    showPage(multisigSendPage);
    const select = document.getElementById("multisig-send-from-select");
    select.innerHTML = `<option value="">-- 読み込み中... --</option>`;
    try {
      const addresses = await fetchCosignatoryOfAddresses();
      select.innerHTML = addresses.length
        ? addresses.map(a => `<option value="${a}">${a}</option>`).join("")
        : `<option value="">-- 連署者になっているマルチシグアカウントがありません --</option>`;
    } catch (e) {
      console.error("fetchCosignatoryOfAddresses error:", e);
      select.innerHTML = `<option value="">-- 取得に失敗しました --</option>`;
    }
  });

  document.getElementById("menu-multisig-sign")?.addEventListener("click", async () => {
    showPage(multisigSignPage);
    await loadPendingPartialTransactions();
  });

  document.getElementById("submit-multisig-settings-btn")?.addEventListener("click", async () => {
    const additionAddresses = document
      .getElementById("multisig-add-addresses").value
      .split("\n").map(s => s.trim()).filter(Boolean);
    const deletionAddresses = document
      .getElementById("multisig-remove-addresses").value
      .split("\n").map(s => s.trim()).filter(Boolean);
    const minApprovalDelta = parseInt(document.getElementById("multisig-min-approval-delta").value, 10) || 0;

    if (additionAddresses.length === 0 && deletionAddresses.length === 0 && minApprovalDelta === 0) {
      setStatus("multisig-settings-status", "変更内容を入力してください。", "error");
      return;
    }

    setStatus("multisig-settings-status", "送信中...");
    try {
      const hash = await updateMultisigSettings({
        minApprovalDelta,
        additionAddresses,
        deletionAddresses,
      });
      setStatus("multisig-settings-status", `✅ 送信しました。Hash: ${hash}`, "success");
      document.getElementById("multisig-add-addresses").value = "";
      document.getElementById("multisig-remove-addresses").value = "";
    } catch (e) {
      console.error("updateMultisigSettings error:", e);
      setStatus("multisig-settings-status", e.message || "送信に失敗しました。", "error");
    }
  });

  document.getElementById("submit-multisig-send-btn")?.addEventListener("click", async () => {
    const multisigAddress = document.getElementById("multisig-send-from-select").value;
    const recipientAddress = document.getElementById("multisig-send-recipient").value.trim();
    const amountXem = parseFloat(document.getElementById("multisig-send-amount").value) || 0;
    const message = document.getElementById("multisig-send-message").value;

    if (!multisigAddress) {
      setStatus("multisig-send-status", "送金元マルチシグアカウントを選択してください。", "error");
      return;
    }
    if (!recipientAddress) {
      setStatus("multisig-send-status", "宛先アドレスを入力してください。", "error");
      return;
    }

    setStatus("multisig-send-status", "提案中...");
    try {
      const hash = await sendFromMultisig({ multisigAddress, recipientAddress, amountXem, message });
      setStatus(
        "multisig-send-status",
        `✅ 送金を提案しました。Hash: ${hash}\n必要な承認数に応じて、他の連署者が「マルチシグ署名」から承認する必要があります。`,
        "success"
      );
    } catch (e) {
      console.error("sendFromMultisig error:", e);
      setStatus("multisig-send-status", e.message || "提案に失敗しました。", "error");
    }
  });

  document.getElementById("multisig-pending-list")?.addEventListener("click", async e => {
    const btn = e.target.closest('[data-action="cosign"]');
    if (!btn) return;

    const hash = btn.dataset.hash;
    const multisigAddress = btn.dataset.multisig;
    btn.disabled = true;
    btn.textContent = "署名中...";
    try {
      await cosignPending(hash, multisigAddress);
      alert("✅ 連署を送信しました。");
      await loadPendingPartialTransactions();
    } catch (e) {
      console.error("cosignPending error:", e);
      alert(e.message || "連署に失敗しました。");
      btn.disabled = false;
      btn.textContent = "署名する";
    }
  });

  // ============================
  // ネームスペース
  // ============================
  document.getElementById("register-root-namespace-btn")?.addEventListener("click", async () => {
    const name = document.getElementById("root-namespace-name").value.trim();

    if (!name) {
      setStatus("root-namespace-status", "ネームスペース名を入力してください。", "error");
      return;
    }

    setStatus("root-namespace-status", "登録中...");
    try {
      const hash = await registerRootNamespace(name);
      setStatus("root-namespace-status", `✅ 登録リクエストを送信しました。Hash: ${hash}`, "success");
      document.getElementById("root-namespace-name").value = "";
      await loadOwnedNamespaces();
      await populateParentNamespaceSelect();
    } catch (e) {
      console.error("registerRootNamespace error:", e);
      setStatus("root-namespace-status", e.message || "登録に失敗しました。", "error");
    }
  });

  document.getElementById("register-child-namespace-btn")?.addEventListener("click", async () => {
    const parentFqn = document.getElementById("child-namespace-parent-select").value;
    const childName = document.getElementById("child-namespace-name").value.trim();

    if (!parentFqn) {
      setStatus("child-namespace-status", "親ネームスペースを選択してください。", "error");
      return;
    }
    if (!childName) {
      setStatus("child-namespace-status", "子ネームスペース名を入力してください。", "error");
      return;
    }

    setStatus("child-namespace-status", "登録中...");
    try {
      const hash = await registerChildNamespace(parentFqn, childName);
      setStatus("child-namespace-status", `✅ 登録リクエストを送信しました。Hash: ${hash}`, "success");
      document.getElementById("child-namespace-name").value = "";
      await loadOwnedNamespaces();
      await populateParentNamespaceSelect();
    } catch (e) {
      console.error("registerChildNamespace error:", e);
      setStatus("child-namespace-status", e.message || "登録に失敗しました。", "error");
    }
  });

  // ============================
  // モザイク作成
  // ============================
  document.getElementById("create-mosaic-btn")?.addEventListener("click", async () => {
    const namespaceFqn = document.getElementById("mosaic-link-namespace-select").value;
    const mosaicName = document.getElementById("mosaic-name-input")?.value?.trim();
    const description = document.getElementById("mosaic-description-input")?.value?.trim() || "";
    const divisibility = parseInt(document.getElementById("mosaic-divisibility").value, 10) || 0;
    const initialSupply = parseFloat(document.getElementById("mosaic-initial-supply").value) || 0;
    const transferable = document.getElementById("mosaic-transferable").checked;
    const supplyMutable = document.getElementById("mosaic-supply-mutable").checked;

    if (!mosaicName) {
      setStatus("mosaic-create-status", "モザイク名を入力してください。", "error");
      return;
    }

    setStatus("mosaic-create-status", "作成中...");
    try {
      const hash = await createMosaic({
        namespaceFqn,
        mosaicName,
        description,
        divisibility,
        supplyMutable,
        transferable,
        initialSupply,
      });
      setStatus("mosaic-create-status", `✅ 作成リクエストを送信しました。Hash: ${hash}`, "success");
      await loadOwnedMosaicsWithAlias();
    } catch (e) {
      console.error("createMosaic error:", e);
      setStatus("mosaic-create-status", e.message || "作成に失敗しました。", "error");
    }
  });

  // ============================
  // 設定メニュー
  // ============================
  document.getElementById("settings-btn")?.addEventListener("click", () => {
    showPage(settingsPage);
  });

  document.getElementById("menu-node-settings")?.addEventListener("click", async () => {
    showPage(nodeSettingsPage);
    showCurrentNode();
    await loadNodeSettingsCandidates();
  });

  document.getElementById("apply-node-btn")?.addEventListener("click", applyNodeChange);

  // ============================
  // ネットワーク切り替え
  // ============================
  document.getElementById("menu-network-settings")?.addEventListener("click", () => {
    const current = document.getElementById("network-settings-current");
    if (current) {
      current.textContent = appState.networkType === NetworkType.TESTNET ? "Testnet" : "Mainnet";
    }
    setStatus("network-settings-status", "", "default");
    showPage(networkSettingsPage);
  });

  document.getElementById("back-settings-network")?.addEventListener("click", () => showPage(settingsPage));

  async function handleSwitchNetwork(targetNetworkType) {
    setStatus("network-settings-status", "切り替え中...");
    try {
      const ok = await switchNetwork(targetNetworkType);
      if (!ok) {
        alert("ネットワーク切り替えができません");
        setStatus("network-settings-status", "", "default");
        return;
      }
      const current = document.getElementById("network-settings-current");
      if (current) {
        current.textContent = targetNetworkType === NetworkType.TESTNET ? "Testnet" : "Mainnet";
      }
      setStatus("network-settings-status", "✅ 切り替えました。", "success");
      goHome();
    } catch (e) {
      console.error("switchNetwork error:", e);
      alert("ネットワーク切り替えができません");
      setStatus("network-settings-status", "", "default");
    }
  }

  document.getElementById("switch-to-mainnet-btn")?.addEventListener("click", () => handleSwitchNetwork(NetworkType.MAINNET));
  document.getElementById("switch-to-testnet-btn")?.addEventListener("click", () => handleSwitchNetwork(NetworkType.TESTNET));

  // ============================
  // ログイン画面に戻る(データは削除しない)
  // ============================
  document.getElementById("back-to-login-btn")?.addEventListener("click", () => {
    if (!confirm("ログイン画面（パスワード入力画面）に戻ります。保存されたアカウント情報は削除されません。よろしいですか？")) return;
    returnToLoginScreen();
    // 「ログイン画面に戻る」＝パスワード入力画面に戻ること
    showPage(hasVault() ? unlockPage : welcomePage);
  });

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    if (!confirm("ログアウトします。次回は再度ニーモニックの入力が必要になります。よろしいですか？")) return;
    logout();
    showPage(welcomePage);
  });

  // ============================
  // アカウント切替(▼マーク)
  // ============================
  document.getElementById("account-switch-btn")?.addEventListener("click", () => {
    renderAccountSwitcherList();
    showPage(accountSwitcherPage);
  });

  document.getElementById("account-switcher-list")?.addEventListener("click", async e => {
    const hideBtn = e.target.closest('[data-action="hide"]');
    if (hideBtn) {
      const id = hideBtn.dataset.id;
      await setAccountHidden(id, true);
      renderAccountSwitcherList();
      return;
    }

    const row = e.target.closest('[data-action="switch"]');
    if (row) {
      const id = row.dataset.id;
      if (id === appState.activeAccountId) return;
      try {
        await switchToAccount(id);
        updateSwitcherVisibility();
        goHome();
      } catch (err) {
        console.error("switchToAccount error:", err);
        alert(err.message || "アカウントの切替に失敗しました。");
      }
    }
  });

  document.getElementById("add-account-btn")?.addEventListener("click", async () => {
    if (hasCurrentMnemonic()) {
      try {
        await addNextAccountFromCurrentMnemonic();
        updateSwitcherVisibility();
        renderAccountSwitcherList();
        showPage(accountSwitcherPage);
      } catch (e) {
        console.error("addNextAccountFromCurrentMnemonic error:", e);
        alert(e.message || "アカウントの追加に失敗しました。");
      }
      return;
    }

    showPage(addAccountPrivatekeyPage);
  });

  document.getElementById("manage-hidden-accounts-btn")?.addEventListener("click", () => {
    renderHiddenAccountList();
    showPage(hiddenAccountsPage);
  });

  document.getElementById("hidden-account-list")?.addEventListener("click", async e => {
    const btn = e.target.closest('[data-action="unhide"]');
    if (!btn) return;
    await setAccountHidden(btn.dataset.id, false);
    renderHiddenAccountList();
  });

  // ============================
  // アカウント追加(設定・アカウント切替の両方から使う共通画面)
  // ============================
  document.getElementById("menu-add-mnemonic")?.addEventListener("click", () => {
    document.getElementById("add-mnemonic-index").value = nextMnemonicAccountIndex();
    showPage(addAccountMnemonicPage);
  });

  document.getElementById("menu-add-privatekey")?.addEventListener("click", () => {
    showPage(addAccountPrivatekeyPage);
  });

  document.getElementById("add-account-mnemonic-choice")?.addEventListener("click", () => {
    document.getElementById("add-mnemonic-index").value = nextMnemonicAccountIndex();
    showPage(addAccountMnemonicPage);
  });

  document.getElementById("add-account-privatekey-choice")?.addEventListener("click", () => {
    showPage(addAccountPrivatekeyPage);
  });

  document.getElementById("add-mnemonic-submit")?.addEventListener("click", async () => {
    const mnemonicPhrase = document.getElementById("add-mnemonic-input").value.trim();
    const accountIndex = parseInt(document.getElementById("add-mnemonic-index").value, 10) || 0;
    const label = document.getElementById("add-mnemonic-label").value;

    if (!mnemonicPhrase) {
      setStatus("add-mnemonic-status", "ニーモニックを入力してください。", "error");
      return;
    }

    setStatus("add-mnemonic-status", "追加中...");
    try {
      await addAccountFromMnemonic(mnemonicPhrase, accountIndex, label);
      document.getElementById("add-mnemonic-input").value = "";
      document.getElementById("add-mnemonic-label").value = "";
      updateSwitcherVisibility();
      goHome();
    } catch (e) {
      console.error("addAccountFromMnemonic error:", e);
      setStatus("add-mnemonic-status", e.message || "追加に失敗しました。", "error");
    }
  });

  document.getElementById("add-privatekey-submit")?.addEventListener("click", async () => {
    const privateKeyHex = document.getElementById("add-privatekey-input").value.trim();
    const label = document.getElementById("add-privatekey-label").value;

    if (!privateKeyHex) {
      setStatus("add-privatekey-status", "秘密鍵を入力してください。", "error");
      return;
    }

    setStatus("add-privatekey-status", "追加中...");
    try {
      await addAccountFromPrivateKey(privateKeyHex, label);
      document.getElementById("add-privatekey-input").value = "";
      document.getElementById("add-privatekey-label").value = "";
      updateSwitcherVisibility();
      goHome();
    } catch (e) {
      console.error("addAccountFromPrivateKey error:", e);
      setStatus("add-privatekey-status", e.message || "追加に失敗しました。", "error");
    }
  });

  // ============================
  // 戻る
  // ============================
  document.getElementById("back-account")?.addEventListener("click", () => showPage(accountPage));
  backSendBtn?.addEventListener("click", () => {
    showPage(cameFromMosaicList ? accountPage : sendPage);
  });
  document.getElementById("back-account-receive")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-harvest")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-settings")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-settings-node")?.addEventListener("click", () => showPage(settingsPage));
  document.getElementById("back-account-switcher")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-hidden-accounts")?.addEventListener("click", () => showPage(accountSwitcherPage));
  document.getElementById("back-add-account-menu")?.addEventListener("click", () => showPage(accountSwitcherPage));
  document.getElementById("back-add-account-mnemonic")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-add-account-privatekey")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-account-advanced")?.addEventListener("click", () => showPage(accountPage));
  document.getElementById("back-advanced-namespace")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-advanced-mosaic")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-advanced-multisig-menu")?.addEventListener("click", () => showPage(advancedPage));
  document.getElementById("back-multisig-menu-settings")?.addEventListener("click", () => showPage(multisigMenuPage));
  document.getElementById("back-multisig-menu-send")?.addEventListener("click", () => showPage(multisigMenuPage));
  document.getElementById("back-multisig-menu-sign")?.addEventListener("click", () => showPage(multisigMenuPage));

  // ============================
  // タブ切替
  // ============================
  const tabToken = document.getElementById("tab-token");
  const tabActivity = document.getElementById("tab-activity");
  const tokenContent = document.getElementById("token-content");
  const activityContent = document.getElementById("activity-content");

  tabToken?.addEventListener("click", () => {
    tabToken.classList.add("active");
    tabActivity.classList.remove("active");
    tokenContent.style.display = "block";
    activityContent.style.display = "none";
  });

  tabActivity?.addEventListener("click", () => {
    tabActivity.classList.add("active");
    tabToken.classList.remove("active");
    tokenContent.style.display = "none";
    activityContent.style.display = "block";
  });

  // ============================
  // アドレスコピー
  // ============================
  document.getElementById("copy-address-btn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(appState.currentAddress.toString());
    showPopup("アドレスをコピーしました");
  });
});
