// proxy-worker.js
// ============================================================
// NIS1ノード(http://のみ対応)を、HTTPSページから使えるようにするための
// Cloudflare Workers 用リバースプロキシです。
//
// 【なぜ必要か】
// NEM(NIS1)のノードは基本的に http://xxx:7890 の形でしか提供されておらず、
// HTTPSには対応していません。一方、GitHub Pages等でホストしたウォレットは
// 常にHTTPSで配信されるため、ブラウザの Mixed Content 制限により
// httpのノードへ直接アクセスすることができません。
// このWorkerを間に挟むことで、
//   ウォレット(https) → このWorker(https) → NIS1ノード(http)
// という経路になり、ブラウザからは常にHTTPSとして見えるようになります。
//
// 【デプロイ手順】
// 1. https://dash.cloudflare.com/ にログイン(無料アカウントでOK)
// 2. 左メニュー「Workers & Pages」→「Create」→「Create Worker」
// 3. エディタの中身をこのファイルの内容で置き換える
// 4. 下の TARGET_NODE を、実際に使いたいNIS1ノードのURL
//    (例: "http://50.3.87.123:7890") に書き換える
// 5. 「Deploy」をクリックすると、
//    https://<worker名>.<あなたのサブドメイン>.workers.dev
//    というURLが発行されます
// 6. ウォレットの「設定 → 接続先ノードの変更」で、そのURLを
//    ノードURLとして指定してください
//
// 【注意】
// ・このWorkerを経由すると、あなたの秘密鍵はブラウザ内から出ませんが、
//   送信するトランザクション内容(署名済みデータ)はこのWorkerを通過します。
//   自分で用意した信頼できるノードに向けてください。
// ・Cloudflare Workers 無料プランには1日あたりのリクエスト数上限があります
//   (執筆時点で目安10万件/日)。個人利用であれば通常問題になりません。
// ============================================================

const TARGET_NODE = "http://50.3.87.123:7890"; // ← ここを実際に使うNIS1ノードに書き換える

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORSプリフライト対応
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const targetUrl = TARGET_NODE + url.pathname + url.search;

    const init = {
      method: request.method,
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text();
    }

    try {
      const res = await fetch(targetUrl, init);
      const body = await res.text();

      return new Response(body, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "proxy fetch failed", detail: String(e) }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
