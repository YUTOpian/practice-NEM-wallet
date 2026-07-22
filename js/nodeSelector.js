// nodeSelector.js
// NIS1にはSymbolの NodeWatch のような第三者ノード監視サービスが無いため、
// シードノードに順番に接続を試み、最初に応答した(生きている)ノードを採用する。
// 生きているノードが見つかった場合は、そのノードの /node/peer-list/reachable
// から他の生きているピアも取得できるようにしておく(設定画面のノード切替用)。

import { MAINNET_SEED_NODES, TESTNET_SEED_NODES } from "./config.js";
import { renderNodeInfoHtml } from "./utils.js";

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timeoutId) };
}

async function isNodeAlive(nodeUrl, timeoutMs = 2500) {
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
  // (settings画面から手動で生きているノードに切り替えてもらう前提)
  const fallback = candidates[0];
  if (infoEl) {
    infoEl.innerHTML = renderNodeInfoHtml({
      isTestnet,
      nodeOrigin: fallback,
      note: `<span style="color:#f97316;">シードノードへの接続に失敗しました。設定からノードを手動指定してください。</span>`,
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
