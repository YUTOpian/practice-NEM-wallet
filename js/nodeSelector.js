// nodeSelector.js
// NIS1にはSymbolの NodeWatch のような第三者ノード監視サービスが無いため、
// シードノードに順番に接続を試み、最初に応答した(生きている)ノードを採用する。
// 生きているノードが見つかった場合は、そのノードの /node/peer-list/reachable
// から他の生きているピアも取得できるようにしておく(設定画面のノード切替用)。
//
// ⚠️ 重要な制約:
// NIS1ノードは基本的に http:// (ポート7890)のみで提供されており、
// HTTPS対応ノードは運用者が個別にリバースプロキシを立てない限り存在しません。
// このアプリをHTTPSページ(GitHub Pagesなど)から開いている場合、
// ブラウザの Mixed Content 制限により http:// のノードへは
// 一切アクセスできません(これはコード側では回避不可能な、
// ブラウザ自体のセキュリティ機能です)。
//
// 対処法:
//   ① このアプリ自体をHTTPで配信する(ローカルで index.html を直接開く、
//      または `python3 -m http.server` 等で配信する)
//   ② HTTPSに対応したNIS1ノード、または自分でHTTP→HTTPSの
//      リバースプロキシを用意し、その https:// URL を
//      「設定 → 接続先ノードの変更」で手動指定する
//      (Cloudflare Workersなどで簡単に作れます。詳しくは
//       同梱の NOTES.md を参照してください)

import { MAINNET_SEED_NODES, TESTNET_SEED_NODES } from "./config.js";
import { renderNodeInfoHtml } from "./utils.js";

function isMixedContentBlocked(nodeUrl) {
  return (
    typeof location !== "undefined" &&
    location.protocol === "https:" &&
    nodeUrl.startsWith("http://")
  );
}

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

async function isNodeAlive(nodeUrl, timeoutMs = 2500) {
  // https ページから http ノードへは原理的に到達不可能なので、
  // 無駄なリクエスト(＝コンソールを埋める Mixed Content エラー)を出さずに
  // 即座に「ダメ」と判定する
  if (isMixedContentBlocked(nodeUrl)) return null;

  const { signal, clear } = withTimeout(null, timeoutMs);
  try {
    const res = await fetch(new URL("/chain/height", nodeUrl), { signal });
    clear();
    if (!res.ok) return null;
    const json = await res.json();
    const height = json?.height;
    return Number.isFinite(height) ? height : null;
  } catch (e) {
    clear();
    return null;
  }
}

export async function selectNode(isTestnet) {
  const infoEl = document.getElementById("node-info");
  const seeds = isTestnet ? TESTNET_SEED_NODES : MAINNET_SEED_NODES;

  if (infoEl) infoEl.textContent = "ノードに接続中…";

  const pageIsHttps = typeof location !== "undefined" && location.protocol === "https:";
  const allSeedsAreHttp = seeds.every((s) => s.startsWith("http://"));

  // シードノードをシャッフルして順番に試す
  const candidates = [...seeds].sort(() => Math.random() - 0.5);

  for (const nodeUrl of candidates) {
    const height = await isNodeAlive(nodeUrl);
    if (height != null) {
      if (infoEl) {
        infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, nodeOrigin: nodeUrl });
      }
      return nodeUrl;
    }
  }

  // 全滅した場合は、それでも先頭のノードをそのまま返す
  // (設定画面から手動で生きているノードに切り替えてもらう前提)
  const fallback = candidates[0];

  if (infoEl) {
    const mixedContentHint =
      pageIsHttps && allSeedsAreHttp
        ? `<div style="color:#f97316;margin-top:6px;font-size:13px;">
             ⚠️ このページはHTTPSで開かれていますが、既定のNIS1ノードは
             すべてHTTPのみ対応のため接続できません(ブラウザのMixed Content制限)。<br>
             「設定 → 接続先ノードの変更」からHTTPS対応ノードのURLを入力するか、
             このアプリをHTTPで配信してください。詳しくはNOTES.mdを参照。
           </div>`
        : `<span style="color:#f97316;">シードノードへの接続に失敗しました。設定からノードを手動指定してください。</span>`;

    infoEl.innerHTML = renderNodeInfoHtml({
      isTestnet,
      nodeOrigin: fallback,
      note: mixedContentHint,
    });
  }
  return fallback;
}

/**
 * 現在接続中のノードから、生きている他のピアの候補一覧を取得する
 * (設定画面のノード切替候補として利用)
 */
export async function fetchReachablePeers(nodeUrl) {
  try {
    const res = await fetch(new URL("/node/peer-list/reachable", nodeUrl));
    const json = await res.json();
    const list = json?.data ?? [];
    return list
      .map((p) => {
        const host = p?.endpoint?.host;
        const port = p?.endpoint?.port;
        const protocol = p?.endpoint?.protocol ?? "http";
        if (!host || !port) return null;
        return `${protocol}://${host}:${port}`;
      })
      .filter(Boolean);
  } catch (e) {
    console.warn("ピア一覧の取得に失敗しました", e);
    return [];
  }
}
