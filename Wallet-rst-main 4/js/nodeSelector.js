// nodeSelector.js
// NodeWatch を使って優良ノードを 1 つ選ぶ

import {
    MAINNET_NODEWATCH_URL,
    TESTNET_NODEWATCH_URL,
    MAINNET_FALLBACK_NODES,
    TESTNET_FALLBACK_NODES,
} from "./config.js";

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

export async function selectNode(isTestnet) {
    const infoEl = document.getElementById("node-info");

    const NODEWATCH_URL = isTestnet
        ? TESTNET_NODEWATCH_URL
        : MAINNET_NODEWATCH_URL;
    const FALLBACKS = isTestnet ? TESTNET_FALLBACK_NODES : MAINNET_FALLBACK_NODES;

    infoEl.textContent = "NodeWatch からノード選択中…";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    try {
        const res = await fetch(NODEWATCH_URL, { signal: controller.signal });
        clearTimeout(timeoutId);

        const nodes = await res.json();
        if (!Array.isArray(nodes) || nodes.length === 0) {
            throw new Error("NodeWatch empty");
        }

        // 高さでソートして一番進んでいるノードを採用
        nodes.sort((a, b) => b.height - a.height);
        const best = nodes[0];

        const u = new URL(best.endpoint); // 例: https://xxx:3001
        u.protocol = "https:"; // 念のため https 固定
        const nodeOrigin = u.origin;

        infoEl.innerHTML =
            `<div style="font-size: 20px; font-weight: bold; color: #8ab4f8;">
             ${isTestnet ? "🟡 Testnet" : "🟢 Mainnet"}
             </div>` +
            `使用ノード：<b>${nodeOrigin}</b><br>` +
            `ブロック高：${best.height}`;

        return nodeOrigin;
    } catch (e) {
        console.warn("NodeWatch 失敗 → fallback ノードを使用", e);
        const fallback = pickRandom(FALLBACKS);

        infoEl.innerHTML =
            `接続中ネットワーク：<b>${isTestnet ? "Testnet" : "Mainnet"}</b><br>` +
            `使用ノード：<b>${fallback}</b><br>` +
            `<span style="color:#f97316;">NodeWatch 失敗のため fallback ノード</span>`;

        return fallback;
    }
}
