//utils.js
export function hexToBytes(hex) {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}

// ★ 2秒(+フェード)で自動消えるポップアップ表示

export function showPopup(message, isError = false) {
  let popup = document.getElementById("copy-popup");

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "copy-popup";
    popup.className = "popup-card";
    popup.style.position = "fixed";

    // ▼▼ 中央配置 ▼▼
    popup.style.left = "50%";
    popup.style.top = "50%";
    popup.style.transform = "translate(-50%, -50%)";

    popup.style.zIndex = "9999";
    document.body.appendChild(popup);
  }

  popup.innerHTML = `
    <div>${message}</div>
  `;

  popup.style.display = "block";
  popup.style.opacity = "1";
  popup.style.transition = "opacity .4s";

  // ★ 一定時間後フェードアウト
  setTimeout(() => {
    popup.style.opacity = "0";

    setTimeout(() => {
      popup.style.display = "none";
    }, 400);
  }, 3000);
}

let soundQueue = Promise.resolve();

export function playSoundOnce(file) {
  soundQueue = soundQueue
    .then(() => {
      return new Promise((resolve) => {
        const audio = new Audio(file);
        audio.volume = 1.0;

        audio.play().catch(() => {}).finally(() => {
          setTimeout(resolve, 100);
        });
      });
    });
}

// ============================================================
// モザイク/XEM 数量表示フォーマット
// ============================================================

export function formatMosaicAmount(amount, divisibility = 0) {
  const value = Number(amount) / (10 ** divisibility);

  return value.toLocaleString("ja-JP", {
    maximumFractionDigits: divisibility,
  });
}

export function hexToUint8Array(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

// ============================================================
// #node-info 表示用 共通HTML生成
// ネットワーク表記（Mainnet/Testnet）のみを表示する
// (使用ノードのURL表示は廃止。テストネット時のみフォーセットへのリンクを添える)
// ============================================================

export function renderNodeInfoHtml({ isTestnet, connected = true }) {
  const disconnectedBadge = connected
    ? ""
    : `<div style="font-size:14px;color:#94a3b8;">⚫️未接続</div>`;

  const faucetLink = isTestnet
    ? `<div style="font-size:13px;margin-top:2px;">` +
      `<a href="https://testnet.nem.tools/" target="_blank" rel="noopener" style="color:#8ab4f8;">THE XEM FAUCET</a>` +
      `</div>`
    : "";

  return (
    `<div style="font-size: 20px; font-weight: bold; color: #8ab4f8;">` +
    `${isTestnet ? "🟡 Testnet" : "🟢 Mainnet"}` +
    `</div>` +
    disconnectedBadge +
    faucetLink
  );
}
