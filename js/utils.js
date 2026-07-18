//utils.js
export function hexToBytes(hex) {
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  return new Uint8Array(bytes);
}


// ★ 2秒で自動消えるポップアップ表示

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

  // ★ 2秒後フェードアウト
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

        // 再生開始。エラーでも resolve する
        audio.play().catch(() => {}).finally(() => {
          setTimeout(resolve, 100); // 音再生は別スレッド扱いに
        });
      });
    });
}
