// auth.js
// 認証方式の管理: ニーモニックインポート・秘密鍵インポート(ローカル署名)のみに対応。
// SSS Extension(Symbol専用の署名拡張機能)はNEMには使えないため撤去した。
// マルチアカウント対応。パスワードを設定した場合のみ、暗号化してlocalStorageに保存する。

import { appState, NetworkType } from "./config.js";
import { selectNode } from "./nodeSelector.js";
import { initSdk } from "./sdk.js";
import { refreshAccount } from "./account.js";
import { loadRecentTx, initLiveTx } from "./transactions.js";
import { initWebSocket, closeWebSocket } from "./ws.js";
import { setText } from "./ui.js";

const VAULT_KEY = "walletVault";

// 現在ログインに使ったニーモニック(セッション中のみメモリ保持、保存はしない)
let currentMnemonicPhrase = null;

export function hasCurrentMnemonic() {
  return !!currentMnemonicPhrase;
}

/* ============================================================
   新規ニーモニック生成(「新規作成」機能用)
   BIP39の24単語(256bit)ニーモニックを生成して返す。
   まだどこにも保存しない(画面に表示して記録してもらうだけ)。
============================================================ */
export async function generateNewMnemonic() {
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

export function getAccounts() {
  return appState.accounts;
}

/* ============================================================
   アカウント切替（ニーモニック由来 / 秘密鍵由来）
============================================================ */
export async function switchToAccount(id) {
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
export async function loginWithMnemonic(mnemonicPhrase, networkType, accountIndex = 0) {
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

export async function addAccountFromMnemonic(mnemonicPhrase, accountIndex, label) {
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
export async function addNextAccountFromCurrentMnemonic(label) {
  if (!currentMnemonicPhrase) {
    throw new Error("ニーモニックがメモリ上にありません（ログインし直すか、秘密鍵で追加してください）");
  }

  const used = appState.accounts
    .filter((a) => a.source === "mnemonic")
    .map((a) => a.accountIndex ?? 0);
  const nextIndex = used.length === 0 ? 0 : Math.max(...used) + 1;

  return await addAccountFromMnemonic(currentMnemonicPhrase, nextIndex, label);
}

export async function addAccountFromPrivateKey(privateKeyHex, label) {
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
export async function setAccountHidden(id, hidden) {
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
    "none"      … 何も保存されていない(ログアウト直後)
    "plain"     … パスワード未設定。ログアウトするまでは平文でこの端末に保存し、
                   次回リロード時は確認なしで自動ログインする
    "encrypted" … パスワード設定済み。次回はパスワード入力が必要
*/
export function getVaultMode() {
  const encRaw = localStorage.getItem(VAULT_KEY);
  if (encRaw) {
    try {
      if (JSON.parse(encRaw).encrypted) return "encrypted";
    } catch {
      /* ignore */
    }
  }

  const plainRaw = sessionStorage.getItem(VAULT_KEY);
  if (plainRaw) return "plain";

  return "none";
}

export function hasVault() {
  return getVaultMode() !== "none";
}

export function clearVault() {
  localStorage.removeItem(VAULT_KEY);
  sessionStorage.removeItem(VAULT_KEY);
  sessionSalt = null;
  sessionKey = null;
}

async function persistAccounts() {
  const persistable = appState.accounts;
  if (persistable.length === 0) return;

  const payload = {
    accounts: persistable,
    networkType: appState.networkType,
    activeAccountId: appState.activeAccountId,
  };

  if (sessionKey && sessionSalt) {
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
    sessionStorage.removeItem(VAULT_KEY);
  } else {
    sessionStorage.setItem(VAULT_KEY, JSON.stringify(payload));
  }
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

export async function restorePlainVault() {
  const raw = sessionStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error("保存されたアカウントがありません");

  const payload = JSON.parse(raw);
  const targetId = restoreAccountsPayload(payload);
  await switchToAccount(targetId);
}

export async function saveVault(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKeyFromPassword(password, salt);
  sessionSalt = salt;
  sessionKey = key;
  await persistAccounts();
}

export async function unlockVault(password) {
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
export function buildNemAnnouncePayload(tx) {
  const signature = appState.facade.signTransaction(appState.localKeyPair, tx);
  const dataHex = appState.sdkCore.utils.uint8ToHex(tx.serialize());
  const signatureBytes = signature.bytes ?? signature;
  const signatureHex = appState.sdkCore.utils.uint8ToHex(signatureBytes);

  return {
    jsonPayload: JSON.stringify({ data: dataHex, signature: signatureHex }),
    signature,
  };
}

export function encryptMessageLocally(recipientPubKeyHex, plainText) {
  const encoder = new appState.sdkNem.MessageEncoder(appState.localKeyPair);
  const recipientPub = new appState.sdkCore.PublicKey(recipientPubKeyHex);
  return encoder.encode(recipientPub, new TextEncoder().encode(plainText));
}

/* ============================================================
   署名 → アナウンス（共通処理）
   送金・ハーベスト・ネームスペース登録・モザイク作成・マルチシグなど、
   トランザクションを送る全機能から共通で使う。
============================================================ */
export async function signAndAnnounceTx(tx) {
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
   ログイン画面に戻る(保存データは削除しない)
   ログアウトと違い、保存済みのアカウント情報(パスワードで暗号化されたもの、
   または平文保存されたもの)はそのまま残す。単に今のセッションを終了して
   ログイン画面(パスワード入力 または ようこそ画面)に戻すだけの処理。
   実際にどちらの画面を表示するかは、呼び出し側で getVaultMode() を見て判断する。
============================================================ */
export function returnToLoginScreen() {
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
export async function switchNetwork(targetNetworkType) {
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
export function logout() {
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
