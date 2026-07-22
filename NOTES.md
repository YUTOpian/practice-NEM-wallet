# 移植にあたっての注意点・要検証事項

## ✅ 解決済み: file:// で開けない / Mixed Content エラー

以前は、①`type="module"`が`file://`でCORSエラーになる、②HTTPSページから
http://のNIS1ノードにMixed Content制限で繋がらない、という2つの問題が
ありました。以下の対応で両方解決しています。

- **①**: `js/src/*.js` を1つに結合した非モジュール版 `js/bundle.js` を
  `<script src="js/bundle.js"></script>`(`type="module"`無し)で読み込む形に変更。
  `file://`で直接`index.html`を開いても動作します。
- **②**: 既定のシードノード([`js/src/config.js`](./js/src/config.js))を、
  [nemnodes.org](https://nemnodes.org/nodes) 上でHTTPS対応(7891番ポート)が
  確認できたノードのみに絞り、**HTTP専用ノードには一切接続しない仕様**に
  変更(`js/src/nodeSelector.js`, `js/src/settings.js`, `js/src/harvest.js`)。

もしシードノードが繋がらなくなっていたら、nemnodes.orgで最新のHTTPS対応
ノードを確認し、「設定 → 接続先ノードの変更」から手動で指定してください。

---

## 確度が高い(既存資料で確認済み)
- `symbol-sdk` v3 は Symbol専用ではなく、`nem` 名前空間 (`NemFacade`) を
  含む共通SDKであること
- NEMの版バイト(NetworkType)がSymbolと同じ数値(Mainnet=104, Testnet=152)を
  使っていること
- NIS1 REST APIの大まかなエンドポイント構成
  (`/account/get`, `/account/mosaic/owned`, `/account/transfers/all`,
  `/account/unconfirmedTransactions`, `/transaction/announce`,
  `/chain/height`, `/account/harvests`, `/account/unlock` など)
- NIS1ノードは http(7890) が基本で、HTTPS対応ノードは 7891番ポートで
  stunnel等により提供されるのが慣習であること(nemnodes.org掲載ノードで確認済み)

## 確度が低い・要検証(推測で実装した部分)

### 1. `js/src/auth.js` — `signAndAnnounceTx` / `buildNemAnnouncePayload`
NIS1の `/transaction/announce` は `{ data, signature }` の2フィールド構成を
要求しますが、`tx.serialize()` が「署名前のエンティティ」バイト列を正しく
返すかどうかは未検証です。もし動かない場合、`NemFacade` 側に
announce用のヘルパー(例: `attachSignature` 相当）が別途あるかもしれないので、
`console.log(appState.facade)` で確認してください。

### 2. `js/src/transfer.js`, `js/src/multisig.js` — `TransferTransactionV1Descriptor`
コンストラクタの引数順(`recipientAddress, amount, mosaics, message`)は
Symbol版の記法から類推したものです。実際のフィールド名・順序が違う場合は
ブラウザコンソールで
```js
console.log(appState.sdkNem.descriptors)
```
を実行し、実際のクラス名一覧を確認・修正してください。

### 3. `js/src/multisig.js` — マルチシグ関連ディスクリプタ
`MultisigAccountModificationTransactionV1Descriptor`,
`MultisigTransactionV1Descriptor`, `MultisigSignatureTransactionV1Descriptor`
の実在するクラス名・引数は未確認です。特に:
- 連署の際に必要な `otherHash` が「内側のTxのハッシュ」か
  「マルチシグTx自体のハッシュ」かは、NIS1の実装でも紛らわしいポイントで、
  本コードは後者(マルチシグTx自体のハッシュ)を前提にしています。

### 4. `js/src/harvest.js` — `ImportanceTransferTransactionV1Descriptor`
`mode`定数名 (`models.ImportanceTransferMode.ACTIVATE` / `DEACTIVATE`) は
推測です。また `meta.remoteStatus` の値("ACTIVE"/"INACTIVE"等)も
NIS1のバージョンによって表記が異なる場合があります。

### 5. `js/src/namespace.js`, `js/src/mosaic.js`
`ProvisionNamespaceTransactionV1Descriptor` はレンタル料(rentalFeeSink /
rentalFee)をSDKが自動補完してくれる前提で実装しています。
もし明示的に渡す必要がある場合はエラーメッセージを見て追加してください。
`MosaicDefinitionTransactionV1Descriptor` の `properties` (divisibility等)の
表現も、配列 `[{name, value}]` 形式を前提にしていますが、
オブジェクト形式かもしれません。

### 6. `js/src/config.js` — シードノード一覧
[nemnodes.org](https://nemnodes.org/nodes) 掲載時点でHTTPS対応が確認できた
ノードですが、NIS1は稼働ノード数が減少傾向にあり、ノードの生死は流動的です。
定期的に同サイトで最新の生存・HTTPS対応ノードに置き換えてください。
テストネットはHTTPS対応ノードが確認できなかったため空にしてあります。

### 7. 手数料計算・タイムスタンプ
- 手数料は「基準手数料への倍率」という単純化したモデルにしています
  (NIS1の正式な手数料計算式(辺の数・モザイク係数を考慮)は反映していません)。
- ジェネシス時刻は `2015-03-29T00:06:25Z` を使用していますが、
  表示用途のみなので多少のズレがあっても実害はありません。

## 動作確認の進め方(おすすめ)
1. `index.html` を直接ブラウザで開き、ニーモニックでログインして
   残高・送金・履歴表示がまず動くか確認
2. うまくいかない箇所があれば、該当ファイルの冒頭コメントに書いた
   「⚠️ 要検証」の指示に従い `appState.sdkNem` の実際の中身をコンソールで確認
3. マルチシグ・ハーベスト・ネームスペース/モザイクは、この順で後回しにしても
   実害の少ない機能なので、コア機能(残高・送金)から順に検証することを推奨
