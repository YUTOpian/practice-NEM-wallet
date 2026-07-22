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

import { appState, NetworkType } from "./config.js";

const SDK_VERSION = "3.3.0";

/**
 * SDK 初期化
 * NEMは /network/properties のようなネットワーク自己申告APIが無いため、
 * NODEが未設定でも(ノード選択前でも)初期化して問題ない。
 */
export async function initSdk() {
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
export const facade = () => appState.facade;
export const sdkCore = () => appState.sdkCore;
export const sdkNem = () => appState.sdkNem;
