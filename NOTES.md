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

### 1. `js/src/auth.js` — 署名処理 (`signAndAnnounceTx` / `buildNemAnnouncePayload`)

#### 🔴→✅ 実機検証で判明した根本原因と対処
実際にテストネットへ送金を試した結果、以下が段階的に判明しました:

1. `{ data: tx.serialize()のhex, signature }` を自前でJSON化してPOSTすると
   NISノード側でバイナリを正しく復元できず
   `expected value for property recipient, but none was found` となった
   → `facade.transactionFactory.static.attachSignature()` を使う形に変更し解消。
2. しかしその後も `FAILURE_SIGNATURE_NOT_VERIFIABLE` で拒否され続けた。
   `facade.signTransaction()` で得た署名は、SDK自身の `Verifier.verify()` による
   自己検証でも **false**(=SDK内で見ても不正な署名)になることを確認。
   一方 `KeyPair.sign(data)` による生の署名は自己検証では **true** になるにも関わらず、
   実際のNIS1ネットワークには相変わらず拒否され続けた。
3. これは symbol-sdk v3 の `NemFacade` が、NEM(NIS1)本来の
   **KECCAK_REVERSED_KEY 署名方式**を正しく再現できていない
   (symbol-sdkは元々Symbol/Catapult対応のためSHA-512ベースへ移行した経緯があり、
    その影響でNEM用の署名部分にも本来のKeccak方式との非互換が残っている可能性が高い)
   ことが濃厚と判断しました。

#### 現在の実装
上記の理由から、**署名処理だけ** NEM専用の実績あるライブラリ
[`nem-sdk`](https://www.npmjs.com/package/nem-sdk)(v1.6.11、esm.sh経由で読み込み)に
切り替えています。トランザクションの構造の組み立て(`recipient`/`amount`/`message`/`fee`等)は
引き続きsymbol-sdkの`descriptors`を使い(構造自体は実機で正しいことを確認済み)、
`attachSignature()`で得られる正しい構造の`"data"`に対して、`nem-sdk`の
`nem.crypto.keyPair.create(privateKeyHex).sign(dataHex)`で署名し直す、という
ハイブリッド構成にしています。

```js
// symbol-sdkで正しい構造の"data"を取得
const probeSignature = appState.localKeyPair.sign(tx.serialize());
const probePayload = JSON.parse(
  appState.facade.transactionFactory.static.attachSignature(tx, probeSignature)
);
// nem-sdkで実際に署名
const nem = await loadNemSdk(); // "https://esm.sh/nem-sdk@1.6.11"
const nemKeyPair = nem.crypto.keyPair.create(appState.localPrivateKeyHex);
const signatureHex = nemKeyPair.sign(probePayload.data);
```

⚠️ **まだ実際のネットワークでの最終確認が取れていません。** 特に以下は注意して確認してください:
- `nem-sdk`が同じ秘密鍵から導出する公開鍵が、symbol-sdkの導出結果(`appState.currentPubKey`、
  これまで使ってきたアドレスのもと)と一致するか(`console.log`の
  `[diagnostic] 公開鍵が一致:` 行で確認可能)。**一致しない場合、これまで使っていた
  アドレスとnem-sdkで送金する際のアドレスが食い違う可能性があるため、送金前に必ず確認してください。**
- `nem-sdk`はメンテナンスが長らく止まっている(最終更新から数年)ライブラリです。
  esm.sh経由の読み込みで問題が起きる場合は、npmで別途インストールして
  バンドルする方法に切り替える必要があるかもしれません。

### 2. `js/src/transfer.js`, `js/src/multisig.js`, `js/src/offlineTx.js`, `js/src/supernode.js`
#### ✅ 修正済み(以前は誤り): `TransferTransactionV1Descriptor`
symbol-sdk公式ドキュメント(npm README)で実例が確認できたため、以下の形に修正済みです。
```js
new descriptors.TransferTransactionV1Descriptor(
  recipientAddress,               // Address
  new models.Amount(1000000n),    // XEMの量(microXEM)。V1はXEM専用でモザイク配列は取れない
  new descriptors.MessageDescriptor(models.MessageType.PLAIN, "hello nem") // 文字列をそのまま渡す
);
```
`message`は単純な`{type, payload}`オブジェクトではなく`MessageDescriptor`インスタンスが必要な点、
平文メッセージはhex化せず文字列のまま渡す点に注意してください。

#### ⚠️ 未確認のまま残っている点
- `models.MessageType.ENCRYPTED` という定数名は未確認です(`PLAIN`のみ公式実例で確認済み)。
  暗号化メッセージ送信でエラーが出る場合は、ブラウザコンソールで
  `console.log(appState.sdkNem.models.MessageType)` を実行し、実際の定数名を確認してください。
- **カスタムモザイク(XEM以外)の送金は、V1では対応できないと判断し、現状このアプリでは
  明示的にエラーを返して無効化しています。** NEMでモザイクを送るための正しいディスクリプタ
  (V2に相当するもの)の仕様が確認できていません。対応するには
  `console.log(appState.sdkNem.descriptors)` で実際に存在するTransferTransaction系の
  クラス一覧を確認し、`transfer.js`のガード部分を実装し直してください。

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

### 7. `js/src/supernode.js` — スーパーノード・プログラムのエントリー機能
公式ガイド(docs.nem.io)に基づき実装していますが、以下は未検証・現状不明です:
- `https://nem.io/supernode/api/codeword/<public_key>` のコードワード取得APIが
  現在も稼働しているか(ブラウザからCORSで叩けるかも含む)。失敗した場合は
  画面から手動でコードワードを入力できるようにしてあります。
- スーパーノード・プログラム自体が現在も稼働中か、報酬が実際に出ているか
  (NEM/NIS1のネットワーク活動は年々縮小しているため、プログラムの現状は
  ご自身で最新情報を確認してください)。
- エントリー用アドレスは毎月変わり、公式Twitter/Discordで告知されるため、
  アプリ側にハードコードしていません(毎回手動入力が必要です)。
- 実際にスーパーノードとして稼働させるための「NISノード+Node Servantの
  設置」自体は、ブラウザ上のこのウォレットでは行えません
  (ご自身のサーバーで別途セットアップが必要です)。

### 8. `js/src/offlineTx.js` — オフライントランザクション機能
- 「オフライン環境」であることはこのアプリのコードでは保証できません
  (あくまで「同じアプリをネットワークに繋がっていない端末で開いて署名する」
   という運用でユーザー自身が実現するものです)。署名処理自体
  (`createSignedOfflineTx`)はネットワーク通信を一切行わないよう実装しています。
- `payload`フィールドは、NIS1の `/transaction/announce` が要求する
  `{ data, signature }` 形式のうち `data`(署名前エンティティのhex)に対応します。
  ブロードキャスト時は `{ data: payload, signature }` の形に組み立て直して送信します。
- ブロードキャスト側(`welcome-page`/`unlock-page`から読み込む処理)は、
  意図的に `appState.facade` や秘密鍵に一切アクセスしない設計にしてあります
  (ログインしていなくても動作します)。
- 「オフライントランザクション」ページ(高度機能内)のファイル読み込み欄は、
  既に署名済みの `KASANE_OFFLINE_TX` を誤って読み込ませた場合に
  「署名済みなので読み込めません」で拒否するガードのみを実装しています。

### 9. 手数料計算・タイムスタンプ
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
