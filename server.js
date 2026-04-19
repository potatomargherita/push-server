const express = require("express");
const webpush = require("web-push");
const cors = require("cors");
const fetch = require("node-fetch");

const cron = require("node-cron");

// Firebase
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  })
});

const db = admin.firestore();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// VAPIDキー
const publicKey = "BI3cHWxxzzPjgEI7V4Nw5HIA0lrFWK3PFw0a2LR8qMRIg26GLru9R3jefP15ZJNjVMj9zu_JLkO_2O_knVNd5bI";
const privateKey = "RSYLW6bgHgOCEj7Wc6Z4GsIj4g9Jm5KFFafkGJIKNFo";

webpush.setVapidDetails(
  "mailto:test@test.com",
  publicKey,
  privateKey
);

// 登録API（Firebase保存）
app.post("/subscribe", async (req, res) => {
  const newSub = req.body;

  try {
    // 🔥 endpointをIDにして保存（重複防止）
    await db.collection("subs").add(newSub);

    console.log("登録成功");
    res.send("登録OK");
  } catch (e) {
    console.error("登録エラー:", e);
    res.status(500).send("登録失敗");
  }
});


// 通知送信API
app.post("/send", async (req, res) => {
  const { title, body } = req.body;

  const payload = JSON.stringify({
    title: title,
    body: body,
    url: "https://script.google.com/macros/s/AKfycbyBZLegcV8mJ_JXGzvTZ9kC2Q3p3BAqQb80chNl9SEIYyZvUFVi3WXHXGtnZU8j3DeO/exec"
  });

  try {
    const snapshot = await db.collection("subs").get();

    let successCount = 0;

    for (const doc of snapshot.docs) {
      const sub = doc.data();

      try {
        await webpush.sendNotification(sub, payload);
        successCount++;
      } catch (e) {
        console.error("送信失敗:", e.message);

        // 無効なsubscription削除
        await db.collection("subs").doc(doc.id).delete();
      }
    }

    console.log("送信成功:", successCount);
    res.send("送信完了");
  } catch (e) {
    console.error("送信エラー:", e);
    res.status(500).send("送信失敗");
  }
});

// サーバー起動(Render)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("サーバー起動:", PORT);
});

async function sendMorningAbsence() {

  const res = await fetch("https://script.google.com/macros/s/AKfycbyBZLegcV8mJ_JXGzvTZ9kC2Q3p3BAqQb80chNl9SEIYyZvUFVi3WXHXGtnZU8j3DeO/exec?mode=today");
  const list = await res.json();

  let body = "";

  if (list.length === 0) {
    body = "今日は欠席者はいません！";
  } else {
    body = "【今日の欠席】\n" + list.join("\n");
  }

  await sendAll("朝の欠席情報", body);
}

cron.schedule("0 7 * * *", async () => {
  console.log("朝の自動通知");

  await sendMorningAbsence();

}, {
  timezone: "Asia/Tokyo"
});

async function sendAll(title, body) {
  const snapshot = await db.collection("subs").get();

  let count = 0;

  for (const doc of snapshot.docs) {
    const sub = doc.data();

    const payload = JSON.stringify({
      title: title,
      body: body,
      url: "https://script.google.com/macros/s/AKfycbyBZLegcV8mJ_JXGzvTZ9kC2Q3p3BAqQb80chNl9SEIYyZvUFVi3WXHXGtnZU8j3DeO/exec"
    });

    try {
      await webpush.sendNotification(sub, payload);
      count++;
    } catch (e) {
      console.log("送信失敗:", e.message);
    }
  }

  console.log("送信完了:", count);
}

app.get("/morning", async (req, res) => {
  console.log("外部cron起動");

  try {
    await sendMorningAbsence();
    res.send("OK");
  } catch (e) {
    console.error("cronエラー:", e);
    res.status(500).send("ERROR");
  }
});

app.post("/api/absence", async (req, res) => {
  const data = req.body;

  try {
    // GASに保存
    await fetch("https://script.google.com/macros/s/AKfycbyBZLegcV8mJ_JXGzvTZ9kC2Q3p3BAqQb80chNl9SEIYyZvUFVi3WXHXGtnZU8j3DeO/exec", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    // 🔥 ここ追加（通知）
    await sendAll(
      "欠席連絡",
      `${data.grade}${data.name}が${data.date}に${data.status}`
    );

    res.send("OK");

  } catch (e) {
    console.error(e);
    res.status(500).send("ERROR");
  }
});
