// message.js
// TransferTransaction用メッセージ生成

export function createPlainMessage(messageText) {

  const msgBytes =
    new TextEncoder().encode(messageText || "");

  return new Uint8Array([
    0x00,
    ...msgBytes
  ]);

}
