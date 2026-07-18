// transfer.js
// モザイク送金トランザクション（SSS 署名）

import { appState } from "./config.js";
import { setStatus } from "./ui.js";

export async function sendTx() {

  if (
    !appState.NODE ||
    !appState.currentAddress ||
    !appState.currentPubKey ||
    !appState.isSdkReady
  ) {

    setStatus(
      "tx-status",
      "初期化が未完了です。",
      "error"
    );

    return;
  }


  const recipientRaw =
    document.getElementById("tx-recipient").value.trim();


  const amountStr =
    document.getElementById("tx-amount").value;


  const messageText =
    document.getElementById("tx-message").value || "";


 /*
  選択されたモザイクID取得
*/

const selectedMosaicElement =
  document.getElementById("selected-mosaic-id");


console.log(
  "selected mosaic element:",
  selectedMosaicElement
);


const selectedMosaicId =
  selectedMosaicElement?.value;


console.log(
  "selected mosaic id:",
  selectedMosaicId
);

  

  /*
    入力チェック
  */

  if (!selectedMosaicId) {

    setStatus(
      "tx-status",
      "モザイクを選択してください。",
      "error"
    );

    return;
  }


  if (!recipientRaw || amountStr === "") {

    setStatus(
      "tx-status",
      "アドレスと金額は必須です。",
      "error"
    );

    return;
  }



  const recipientAddress =
    new appState.sdkSymbol.Address(recipientRaw);


  const amount =
    Number(amountStr);



  if (
    Number.isNaN(amount) ||
    amount < 0
  ) {

    setStatus(
      "tx-status",
      "金額が不正です。",
      "error"
    );

    return;
  }



  /*
    可分性取得
  */

  const divisibility =
    appState.mosaicInfo?.[selectedMosaicId]?.divisibility ?? 0;



  /*
    モザイク生成
  */

  const mosaicIdBigInt =
    BigInt("0x" + selectedMosaicId);



  const mosaics = [

    new appState.sdkSymbol.descriptors.UnresolvedMosaicDescriptor(

      new appState.sdkSymbol.models.UnresolvedMosaicId(
        mosaicIdBigInt
      ),


      new appState.sdkSymbol.models.Amount(

        BigInt(
          Math.floor(
            amount * (10 ** divisibility)
          )
        )

      )

    )

  ];



  /*
    メッセージ
  */

  const msgBytes =
    new TextEncoder().encode(messageText);


  const payload =
    new Uint8Array([
      0x00,
      ...msgBytes
    ]);



  /*
    トランザクション作成
  */

  const descriptor =
    new appState.sdkSymbol.descriptors.TransferTransactionV1Descriptor(

      recipientAddress,

      mosaics,

      payload

    );



  const tx =
    appState.facade.createTransactionFromTypedDescriptor(

      descriptor,

      appState.currentPubKey,

      100,

      60 * 60

    );



  const txPayloadHex =
    appState.sdkCore.utils.uint8ToHex(
      tx.serialize()
    );



  try {


    setStatus(
      "tx-status",
      "SSSで署名待ち…"
    );



    window.SSS.setTransactionByPayload(
      txPayloadHex
    );


    const signed =
      await window.SSS.requestSign();



    const jsonPayload =
      JSON.stringify({
        payload: signed.payload
      });



    const res =
      await fetch(
        new URL(
          "/transactions",
          appState.NODE
        ),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: jsonPayload
        }
      );



    if (res.ok) {


      setStatus(
        "tx-status",
        `送金をアナウンスしました。ハッシュ: ${signed.hash}`,
        "success"
      );


    } else {


      console.error(
        await res.text()
      );


      setStatus(
        "tx-status",
        "アナウンスに失敗しました。",
        "error"
      );

    }



  } catch(e) {


    console.error(e);


    setStatus(
      "tx-status",
      "署名または送信に失敗しました。",
      "error"
    );


  }

}
