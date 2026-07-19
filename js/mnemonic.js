// mnemonic.js
// ニーモニックインポートによるログイン（SSS Extensionを使わないローカル署名モード）
//
// - BIP39ニーモニック → Symbol用 BIP32導出 で秘密鍵を作成 (symbol-sdk v3の Bip32 / SymbolFacade.bip32NodeToKeyPair を使用)
// - パスワードでAES-GCM暗号化してlocalStorageに保存し、次回以降はパスワードだけで再ログイン可能にする
//
// 注意: ニーモニックをインポートすると秘密鍵はブラウザのメモリ上で扱われる。
//       SSS Extension方式（秘密鍵が拡張機能内に留まる）よりもリスクが高いことを
//       利用者に理解してもらった上で使う機能。

import { appState, NetworkType } from "./config.js";
import { selectNode } from "./nodeSelector.js";
import { initSdk } from "./sdk.js";
import { setLocalKeyPair } from "./signer.js";
import { refreshAccount } from "./account.js";
import { loadRecentTx, initLiveTx } from "./transactions.js";
import { initWebSocket } from "./ws.js";
import { setText, setStatus } from "./ui.js";

const STORAGE_KEY = "symbol_wallet_encrypted_mnemonic_v1";

/* ============================================================
   Base64 <-> Uint8Array
============================================================ */
function toBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/* ============================================================
   パスワード → AES-GCM鍵 (PBKDF2)
============================================================ */
async function deriveAesKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/* ============================================================
   保存済みニーモニックの有無 / 削除
============================================================ */
export function hasStoredMnemonic() {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function forgetStoredMnemonic() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ============================================================
   ニーモニックをパスワードで暗号化して保存
============================================================ */
export async function encryptAndStoreMnemonic(mnemonic, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(mnemonic)
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      salt: toBase64(salt),
      iv: toBase64(iv),
      data: toBase64(new Uint8Array(ciphertext)),
    })
  );
}

/* ============================================================
   保存済みニーモニックをパスワードで復号
============================================================ */
async function decryptStoredMnemonic(password) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    throw new Error("保存されたニーモニックがありません");
  }

  const parsed = JSON.parse(raw);
  const salt = fromBase64(parsed.salt);
  const iv = fromBase64(parsed.iv);
  const key = await deriveAesKey(password, salt);

  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      fromBase64(parsed.data)
    );
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    throw new Error("パスワードが違うか、保存データが壊れています");
  }
}

/* ============================================================
   ニーモニック → KeyPair 導出
   参考: symbol-sdk v3 Bip32 / SymbolFacade.bip32Path / bip32NodeToKeyPair
============================================================ */
function deriveKeyPairFromMnemonic(mnemonic, accountIndex) {
  // テキストエリアからの改行や連続スペースを単一スペースに正規化
  const normalized = mnemonic.trim().replace(/\s+/g, " ");

  const bip32 = new appState.sdkCore.Bip32();
  const bip32Node = bip32.fromMnemonic(normalized, "");

  const bip32Path = appState.facade.bip32Path(accountIndex);
  const childNode = bip32Node.derivePath(bip32Path);

  return appState.sdkSymbol.SymbolFacade.bip32NodeToKeyPair(childNode);
}

/* ============================================================
   接続本体（ノード選択 → SDK初期化 → 鍵導出 → 画面反映 → 各種初期読み込み）
============================================================ */
async function connectCore(mnemonic, { isTestnet, accountIndex, rememberWithPassword }) {
  setStatus("account-status", "ノード選択中...");

  appState.NODE = await selectNode(isTestnet);
  await initSdk();

  const networkType = isTestnet ? NetworkType.TESTNET : NetworkType.MAINNET;
  appState.networkType = networkType;
  appState.connectionMode = "mnemonic";

  const keyPair = deriveKeyPairFromMnemonic(mnemonic, accountIndex ?? 0);
  setLocalKeyPair(keyPair);

  appState.currentPubKey = keyPair.publicKey.toString();

  const publicAccount = appState.facade.createPublicAccount(keyPair.publicKey);
  appState.currentAddress = publicAccount.address;

  setText("network-label", isTestnet ? "Testnet" : "Mainnet");
  setText("account-address", publicAccount.address.toString());
  setStatus("account-status", "ニーモニックで接続済み", "success");

  if (rememberWithPassword) {
    await encryptAndStoreMnemonic(mnemonic, rememberWithPassword);
  }

  await refreshAccount();
  await loadRecentTx();
  initWebSocket(appState.currentAddress.toString());
  initLiveTx(appState.currentAddress.toString());
}

/**
 * 新規にニーモニックを入力してインポート・接続する
 * @param {string} mnemonic
 * @param {{isTestnet:boolean, accountIndex:number, password:?string}} opts password指定時は暗号化保存する
 */
export async function importMnemonic(mnemonic, { isTestnet, accountIndex, password }) {
  return connectCore(mnemonic, {
    isTestnet,
    accountIndex,
    rememberWithPassword: password || null,
  });
}

/**
 * 保存済み（パスワード暗号化済み）のニーモニックで接続する
 */
export async function unlockStoredMnemonic(password, { isTestnet, accountIndex }) {
  const mnemonic = await decryptStoredMnemonic(password);
  return connectCore(mnemonic, {
    isTestnet,
    accountIndex,
    rememberWithPassword: null,
  });
}
