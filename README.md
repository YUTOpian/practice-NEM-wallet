# NEM Simple Wallet

ブラウザだけで使える、シンプルなNEM (XEM) Webウォレットです。
（元は Symbol 用ウォレットでしたが、`symbol-sdk` v3 に同梱されている
  `NemFacade` を使って NEM(NIS1) 版に移植しました）

## 使い方

`index.html` をダブルクリックして直接ブラウザで開くだけで動きます
（`file://` 対応。ローカルサーバーを立てる必要はありません）。
もちろん、GitHub Pages等でHTTPS配信して使うこともできます。

1. ニーモニックフレーズをインポートしてログイン
2. 残高表示・XEM/モザイク送金・ステーキング(委任ハーベスティング)・
   ネームスペース登録・モザイク作成・マルチシグが利用可能

## ログイン方法
このアプリは **ニーモニックインポート / 秘密鍵インポートのみ** に対応しています。
Symbol専用の署名拡張機能である SSS Extension は NEM では利用できないため、撤去しました。

## 接続先ノードについて(重要)
このアプリは **HTTPS対応ノードにのみ接続する仕様** です(http://のノードには
一切接続しません)。理由は2つあります:

1. `file://` やGitHub Pages(https)で開いた場合でも、常に同じ挙動で
   確実に動作するようにするため
2. 通信経路を暗号化するため

既定のシードノード一覧([`js/src/config.js`](./js/src/config.js) の
`MAINNET_SEED_NODES`)は、[nemnodes.org](https://nemnodes.org/nodes) の
ノード一覧でHTTPS対応(7891番ポート)が確認できたものを登録しています。
ノードの生死は流動的なので、繋がらない場合は同サイトで最新のHTTPS対応ノードを
確認し、「設定 → 接続先ノードの変更」から手動で指定してください。

テストネットは執筆時点でHTTPS対応ノードの一覧が確認できなかったため、
既定では接続先が空です。テストネットで試したい場合は、上記サイトで
最新のテストネットノードを確認するか、同梱の `proxy-worker.js` を使って
自分でHTTPS化したノードを用意し、手動で指定してください。

## ファイル構成
```
index.html              ← これを直接ブラウザで開く
css/base.css, css/wallet.css
js/bundle.js             ← 実際に読み込まれる単一ファイル(自動生成・classic script)
js/src/*.js               ← 元のモジュール版ソース(編集はこちら側で)
sounds/*.ogg
proxy-worker.js           ← (任意) HTTP専用ノードをHTTPS化したい場合のCloudflare Workers用プロキシ
```

### `js/bundle.js` について
`index.html` は `<script src="js/bundle.js"></script>` として、
`js/src/*.js` を1つに結合した非モジュール(classic script)版を読み込みます。
これは `file://` で開いたときに ES Modules がCORSエラーでブロックされる
(`type="module"` は `file://` から読み込めない、というブラウザの制約)ため、
その回避策として採用しています。

**コードを修正する場合は `js/src/*.js` を編集し、`js/bundle.js` を
作り直してください。** 手作業で結合する場合は、以下の点に注意してください:
- 各ファイル先頭の `import ... from "./x.js";` 行を削除する
- `export function` / `export const` から `export` を取り除く
- `export { a, b };` のような再exportの行は削除する
- 依存関係の順番([`config.js` → `utils.js` → `ui.js` → `sdk.js` →
  `nodeSelector.js` → `ws.js` → `account.js` → `transactions.js` →
  `auth.js` → `transfer.js` → `namespace.js` → `mosaic.js` →
  `multisig.js` → `harvest.js` → `settings.js` → `accountSwitcher.js` →
  `index.js`])で連結する
- `index.js` の `import QRCode from "https://esm.sh/qrcode";`
  (リモートモジュールの静的import)だけは、classic scriptでは使えないため
  動的import(`await import(...)`)に書き換える必要があります
  (`bundle.js`内の `loadQRCode()` を参照)

## ⚠️ 重要: 実行前に必ずお読みください
このコードは symbol-sdk v3 の `NemFacade` を使う想定で書いていますが、
NEM(NIS1)向けの一部のトランザクション種別(マルチシグ設定/マルチシグ送金/
連署、ハーベスト委任、ネームスペース登録、モザイク作成)のディスクリプタの
正確なコンストラクタ引数は、実機での動作確認ができていません。

詳しくは [`NOTES.md`](./NOTES.md) を参照し、テストネット(または少額)で
一通り動作確認してから本番で使ってください。
