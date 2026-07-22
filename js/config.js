// config.js
// NEM (NIS1) 用 設定値とアプリ全体で共有する状態
//
// symbol-sdk v3 は Symbol専用ではなく、NemFacade を含む共通SDKであるため、
// このアプリでは appState.sdkNem 経由でNEMのトランザクションを構築する。

// ============================================================
// NIS1 シードノード
// NEM(NIS1)は稼働ノード数がSymbolほど多くなく、常時生きているノードを
// 決め打ちするのは現実的ではないため、
// 「シードノードに接続し /node/peer-list/reachable で
//   実際に生きているピアを取得する」方式を採用する(nodeSelector.js参照)。
// 以下はその際に最初に叩くシードノード。
// ※ 長期間運用されていないノードが含まれている可能性があります。
//   実際の利用前に必ず動作確認し、必要に応じて書き換えてください。
// ============================================================
export const MAINNET_SEED_NODES = [
  "http://alice6.nem.ninja:7890",
  "http://62.75.251.134:7890",
  "http://198.204.240.68:7890",
];

export const TESTNET_SEED_NODES = [
  "http://50.3.87.123:7890",
  "http://23.228.67.85:7890",
];

// ============================================================
// XEM (ネイティブ通貨) 可分性
// NEMのXEMはモザイク登場以前からの「疑似モザイク」で、
// 常に namespaceId="nem", name="xem", divisibility=6 固定。
// ============================================================
export const XEM_MOSAIC_ID = { namespaceId: "nem", name: "xem" };
export const XEM_DIVISIBILITY = 6;
export const XEM_MOSAIC_KEY = "nem:xem";

// ============================================================
// Network Type (版バイト。Symbolがこの数値をそのまま引き継いだため共通)
// ============================================================
export const NetworkType = {
  MAINNET: 104, // 0x68 ("N"で始まるアドレス)
  TESTNET: 152, // 0x98 ("T"で始まるアドレス)
};

// ============================================================
// NEMのジェネシス(ネットワーク時刻の起点) 2015-03-29T00:06:25Z
// タイムスタンプ表示にのみ使用
// ============================================================
export const NEM_EPOCH_UNIX_SECONDS = 1427587585;

// ============================================================
// NEM トランザクションタイプ定数(REST APIレスポンスの判別用)
// ============================================================
export const NemTransactionType = {
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
export const appState = {
  // 現在利用中Node
  NODE: null,

  // 手数料倍率(1が標準。NEMは辺の数などから決まる基準手数料に掛け合わせる)
  feeMultiplier: (() => {
    try {
      const saved = Number(localStorage.getItem("feeMultiplier"));
      return Number.isFinite(saved) && saved > 0 ? saved : 1;
    } catch {
      return 1;
    }
  })(),

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
