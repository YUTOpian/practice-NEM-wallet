# 移植にあたっての注意点・要検証事項

## 🚨 既知の問題: Mixed Content エラー(GitHub Pages等HTTPS配信時)

**症状**: コンソールに `Mixed Content: ... blocked` や `Failed to fetch` が大量に出て、
残高やトランザクション履歴が一切取得できない。

**原因**: NIS1(NEM)のノードは基本的に `http://` (ポート7890)のみで提供されており、
運用者が個別にリバースプロキシを立てない限りHTTPSに対応していません。
一方、GitHub Pages等でホストされたこのウォレットは常にHTTPSで配信されるため、
ブラウザの **Mixed Content制限**(HTTPSページから素のHTTPリソースへのアクセスを
ブロックする仕組み)により、httpのNIS1ノードへ接続できません。
これはアプリのバグではなく、ブラウザ側のセキュリティ機能であり、
JavaScriptのコード側だけでは回避できません。

**対処法(どちらか)**:

### 方法A: このアプリ自体をHTTPで配信する(お試し・開発用に最も簡単)
GitHub PagesはHTTPS固定なので使えません。代わりに:
- ローカルで `index.html` を直接ダブルクリックして開く(`file://`)
- または `python3 -m http.server 8000` 等でローカル配信し `http://localhost:8000` で開く

この場合はMixed Content制限そのものが発生しないため、シードノードにそのまま繋がります。

### 方法B: HTTPS→HTTPの中継プロキシを自分で用意する(本番運用向け)
同梱の **`proxy-worker.js`** を使って、Cloudflare Workers(無料枠あり)に
簡単なリバースプロキシをデプロイできます。手順はファイル冒頭のコメントに
書いてあります。デプロイ後に発行されるURL(`https://xxx.workers.dev`)を、
ウォレットの「設定 → 接続先ノードの変更」でノードURLとして指定してください。

デプロイ後は `config.js` の `MAINNET_SEED_NODES` / `TESTNET_SEED_NODES` を
そのWorkerのURLに書き換えておくと、次回以降は自動接続されるようになります。

---

このリポジトリはネットワーク接続のない環境で、ドキュメント検索と一般的な
NIS1 REST API / symbol-sdk v3 の設計パターンの知識をもとに書いたものです。
実際に `symbol-sdk` をインストールしてブラウザで動かした確認はできていないため、
**本番資金を扱う前に、必ずテストネットで一通り動作確認してください。**

## 確度が高い(既存資料で確認済み)
- `symbol-sdk` v3 は Symbol専用ではなく、`nem` 名前空間 (`NemFacade`) を
  含む共通SDKであること
- NEMの版バイト(NetworkType)がSymbolと同じ数値(Mainnet=104, Testnet=152)を
  使っていること
- NIS1 REST APIの大まかなエンドポイント構成
  (`/account/get`, `/account/mosaic/owned`, `/account/transfers/all`,
  `/account/unconfirmedTransactions`, `/transaction/announce`,
  `/chain/height`, `/account/harvests`, `/account/unlock` など)

## 確度が低い・要検証(推測で実装した部分)

### 1. `js/auth.js` — `signAndAnnounceTx` / `buildNemAnnouncePayload`
NIS1の `/transaction/announce` は `{ data, signature }` の2フィールド構成を
要求しますが、`tx.serialize()` が「署名前のエンティティ」バイト列を正しく
返すかどうかは未検証です。もし動かない場合、`NemFacade` 側に
announce用のヘルパー(例: `attachSignature` 相当）が別途あるかもしれないので、
`console.log(appState.facade)` で確認してください。

### 2. `js/transfer.js`, `js/multisig.js` — `TransferTransactionV1Descriptor`
コンストラクタの引数順(`recipientAddress, amount, mosaics, message`)は
Symbol版の記法から類推したものです。実際のフィールド名・順序が違う場合は
ブラウザコンソールで
```js
console.log(appState.sdkNem.descriptors)
```
を実行し、実際のクラス名一覧を確認・修正してください。

### 3. `js/multisig.js` — マルチシグ関連ディスクリプタ
`MultisigAccountModificationTransactionV1Descriptor`,
`MultisigTransactionV1Descriptor`, `MultisigSignatureTransactionV1Descriptor`
の実在するクラス名・引数は未確認です。特に:
- 連署の際に必要な `otherHash` が「内側のTxのハッシュ」か
  「マルチシグTx自体のハッシュ」かは、NIS1の実装でも紛らわしいポイントで、
  本コードは後者(マルチシグTx自体のハッシュ)を前提にしています。

### 4. `js/harvest.js` — `ImportanceTransferTransactionV1Descriptor`
`mode`定数名 (`models.ImportanceTransferMode.ACTIVATE` / `DEACTIVATE`) は
推測です。また `meta.remoteStatus` の値("ACTIVE"/"INACTIVE"等)も
NIS1のバージョンによって表記が異なる場合があります。

### 5. `js/namespace.js`, `js/mosaic.js`
`ProvisionNamespaceTransactionV1Descriptor` はレンタル料(rentalFeeSink /
rentalFee)をSDKが自動補完してくれる前提で実装しています。
もし明示的に渡す必要がある場合はエラーメッセージを見て追加してください。
`MosaicDefinitionTransactionV1Descriptor` の `properties` (divisibility等)の
表現も、配列 `[{name, value}]` 形式を前提にしていますが、
オブジェクト形式かもしれません。

### 6. `config.js` — シードノード一覧
NEM(NIS1)は稼働ノードが年々減っており、`MAINNET_SEED_NODES` /
`TESTNET_SEED_NODES` に列挙したノードが実際に生きているかは保証できません。
[NEM公式のノードモニタリングサイト](https://nem.io) 等で最新の
生存ノードに置き換えてください。

### 7. 手数料計算・タイムスタンプ
- 手数料は「基準手数料への倍率」という単純化したモデルにしています
  (NIS1の正式な手数料計算式(辺の数・モザイク係数を考慮)は反映していません)。
- ジェネシス時刻は `2015-03-29T00:06:25Z` を使用していますが、
  表示用途のみなので多少のズレがあっても実害はありません。

## 動作確認の進め方(おすすめ)
1. テストネットのニーモニックでログインし、残高・送金・履歴表示がまず動くか確認
2. うまくいかない箇所があれば、該当ファイルの冒頭コメントに書いた
   「⚠️ 要検証」の指示に従い `appState.sdkNem` の実際の中身をコンソールで確認
3. マルチシグ・ハーベスト・ネームスペース/モザイクは、この順で後回しにしても
   実害の少ない機能なので、コア機能(残高・送金)から順に検証することを推奨
