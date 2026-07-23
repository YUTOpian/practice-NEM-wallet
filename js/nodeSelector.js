// nodeSelector.js
// このアプリは常に HTTPS対応ノードにのみ接続する仕様です
// (HTTPのみのノードは候補にすら入れません)。
//
// 理由:
//   ① このアプリ自体がHTTPS(GitHub Pages等)で配信されることを前提にしており、
//      HTTPのノードはブラウザのMixed Content制限で原理的に接続不可能
//   ② 通信経路の暗号化(盗聴・改ざん防止)のため
//
// NIS1ノードは基本 http://(7890)のみですが、一部の運用者は
// stunnel等で http→https のリバースプロキシを 7891番ポートで
// 慣習的に立てています。config.js の MAINNET_SEED_NODES には、
// https://nemnodes.org/nodes 上でHTTPS対応が確認できたノードのみを
// 登録しています。
//
// 接続できるHTTPS対応ノードが1つも見つからない場合、この関数は
// (画面に詳細な警告文を出すのではなく) null を返すだけにしてあります。
// 呼び出し側(index.js)で `if (!node) alert("ノードに接続できません")`
// のように、シンプルなアラートで知らせる設計にしています。

import { MAINNET_SEED_NODES, TESTNET_SEED_NODES } from "./config.js";
import { renderNodeInfoHtml } from "./utils.js";

export function isHttpsUrl(nodeUrl) {
  try {
    return new URL(nodeUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

export async function isNodeAlive(nodeUrl, timeoutMs = 2500) {
  // HTTPS以外は候補にすら入れない
  if (!isHttpsUrl(nodeUrl)) return null;

  const { signal, clear } = withTimeout(timeoutMs);
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

/**
 * HTTPS対応ノードを1つ選んで返す。
 * 接続できるノードが無ければ null を返す(画面への警告表示はしない)。
 */
export async function selectNode(isTestnet) {
  const infoEl = document.getElementById("node-info");
  const allSeeds = isTestnet ? TESTNET_SEED_NODES : MAINNET_SEED_NODES;
  const seeds = allSeeds.filter(isHttpsUrl);

  if (infoEl) infoEl.textContent = "ノードに接続中…";

  if (seeds.length === 0) {
    if (infoEl) {
      infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: false });
    }
    return null;
  }

  // シードノードをシャッフルして順番に試す
  const candidates = [...seeds].sort(() => Math.random() - 0.5);

  for (const nodeUrl of candidates) {
    const height = await isNodeAlive(nodeUrl);
    if (height != null) {
      if (infoEl) {
        infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: true });
      }
      return nodeUrl;
    }
  }

  // 全滅した場合は null を返す(http://へのフォールバックは絶対にしない)
  if (infoEl) {
    infoEl.innerHTML = renderNodeInfoHtml({ isTestnet, connected: false });
  }
  return null;
}

/**
 * 現在接続中のノードから、生きている他のピア(HTTPS版)の候補一覧を取得する
 * (設定画面のノード切替候補として利用)
 *
 * NIS1の /node/peer-list/reachable はピアの http(7890)情報しか返さないため、
 * 「httpsは同じホストの7891番ポートで慣習的に提供される」という前提で
 * 候補URLを組み立て、実際に生きているものだけに絞り込んで返す。
 * (この前提が外れているノードは単に候補から漏れるだけで、実害はない)
 */
export async function fetchReachablePeers(nodeUrl) {
  try {
    const res = await fetch(new URL("/node/peer-list/reachable", nodeUrl));
    const json = await res.json();
    const list = json?.data ?? [];

    const httpsCandidates = [
      ...new Set(
        list
          .map((p) => p?.endpoint?.host)
          .filter(Boolean)
          .map((host) => `https://${host}:7891`)
      ),
    ].slice(0, 25); // 検証しすぎて重くならないよう上限を設ける

    const checked = await Promise.all(
      httpsCandidates.map(async (url) => ((await isNodeAlive(url, 2000)) != null ? url : null))
    );

    return checked.filter(Boolean);
  } catch (e) {
    console.warn("ピア一覧の取得に失敗しました", e);
    return [];
  }
}
