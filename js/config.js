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
export const MAINNET_SEED_NODES = [
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
export const TESTNET_SEED_NODES = [
  "https://ntn1.dusanjp.com:7891",
  "https://ntn2.dusanjp.com:7891",
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

  // 手数料倍率(常に1固定。設定画面から変更する機能は廃止した)
  // NEMの createTransactionFromTypedDescriptor 第3引数は、Symbolのような
  // 「サイズに掛け合わせる倍率」ではなく、そのまま手数料の絶対値(microXEM)として
  // 使われるようだった(以前 feeMultiplier:1 を渡した結果、実際に1microXEMという
  // 事実上ゼロの手数料でトランザクションが組み立てられてしまっていたため修正)。
  // 0.15 XEM を既定の手数料としておく(小さな送金+メッセージ程度なら十分な額)。
  feeMultiplier: 150000,

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
