// ================================
//  VITRIO BACKEND — COMPLETO
//  OAuth2 Discord + Omega Points + Shop
// ================================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import admin from "firebase-admin";
import fs from "fs";


// ================================
//  LOAD FIREBASE SERVICE ACCOUNT
// ================================
const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();


// ================================
//  EXPRESS CONFIG
// ================================
const app = express();
app.use(express.json());

const FRONTEND_URL = "https://vitrio-tv.netlify.app";

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);


// ================================
//  DISCORD CONFIG
// ================================
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BOT_TOKEN = process.env.BOT_TOKEN;

// GUILD
const GUILD_ID = "821024627391463504";


// ================================
//  DEBUG ROUTE
// ================================
app.get("/", (req, res) => {
  res.send("Vitrio backend ONLINE");
});


// ===============================================================
//  **API 0 — OAuth2 Exchange Code → Access Token**
// ===============================================================
app.post("/discord/token", async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: "Missing OAuth code" });
  }

  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://vitrio-tv.netlify.app/discord-auth.html"
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await tokenRes.json();

    if (!data.access_token) {
      console.error("OAuth Error:", data);
    }

    return res.json(data);

  } catch (err) {
    console.error("OAuth exchange failed:", err);
    return res.status(500).json({ error: "OAuth failed" });
  }
});


// ===============================================================
//  API 1 — GET USER INFO (BOT TOKEN)
// ===============================================================
app.get("/getUserInfo", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.json({ ok: false, error: "Missing userId" });

  try {
    const user = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    }).then(r => r.json());

    const member = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      {
        headers: { Authorization: `Bot ${BOT_TOKEN}` }
      }
    ).then(r => r.json());

    return res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : null,
        created_at: new Date(Number(user.id) / 4194304 + 1420070400000)
      },
      member: {
        roles: member.roles || [],
        joined_at: member.joined_at || null
      }
    });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, error: "Discord API error" });
  }
});


// ===============================================================
//  OMEGA POINTS — GET
// ===============================================================
app.get("/getOmega", async (req, res) => {
  const userId = req.query.userId;

  if (!userId) return res.json({ ok: false, error: "Missing userId" });

  const snap = await db.collection("users").doc(userId).get();

  return res.json({
    ok: true,
    omega: snap.exists ? (snap.data().omega || 0) : 0
  });
});


// ===============================================================
//  OMEGA POINTS — ADD
// ===============================================================
app.post("/addOmega", async (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || typeof amount !== "number") {
    return res.json({ ok: false, error: "Invalid parameters" });
  }

  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data().omega || 0) : 0;

  const updated = current + amount;

  await ref.set({ omega: updated }, { merge: true });
  await db.collection("omegaHistory").add({
    userId,
    change: amount,
    newTotal: updated,
    type: "ADD",
    timestamp: Date.now()
  });

  return res.json({ ok: true, omega: updated });
});


// ===============================================================
//  OMEGA POINTS — REMOVE
// ===============================================================
app.post("/removeOmega", async (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || typeof amount !== "number") {
    return res.json({ ok: false, error: "Invalid parameters" });
  }

  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data().omega || 0) : 0;

  const updated = Math.max(0, current - amount);

  await ref.set({ omega: updated }, { merge: true });
  await db.collection("omegaHistory").add({
    userId,
    change: -amount,
    newTotal: updated,
    type: "REMOVE",
    timestamp: Date.now()
  });

  return res.json({ ok: true, omega: updated });
});


// ===============================================================
//  OMEGA POINTS — SET (ADMIN)
// ===============================================================
app.post("/setOmega", async (req, res) => {
  const { userId, value } = req.body;

  if (!userId || typeof value !== "number") {
    return res.json({ ok: false, error: "Invalid parameters" });
  }

  await db.collection("users").doc(userId).set({ omega: value }, { merge: true });

  await db.collection("omegaHistory").add({
    userId,
    change: value,
    newTotal: value,
    type: "SET",
    timestamp: Date.now()
  });

  return res.json({ ok: true, omega: value });
});


// ===============================================================
//  OMEGA — HISTORY USER
// ===============================================================
app.get("/getOmegaHistory", async (req, res) => {
  const userId = req.query.userId;

  if (!userId) return res.json({ ok: false, error: "Missing userId" });

  const snap = await db.collection("omegaHistory")
    .where("userId", "==", userId)
    .orderBy("timestamp", "desc")
    .limit(50)
    .get();

  const list = snap.docs.map(doc => doc.data());

  return res.json({ ok: true, history: list });
});


// ===============================================================
//  OMEGA — HISTORY ALL (ADMIN)
// ===============================================================
app.get("/getOmegaHistoryAll", async (req, res) => {
  const limit = Number(req.query.limit) || 50;

  const snap = await db.collection("omegaHistory")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  const list = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return res.json({ ok: true, history: list });
});


// ===============================================================
//  REWARDS — LIST
// ===============================================================
app.get("/getRewards", async (req, res) => {
  const snap = await db.collection("rewards").orderBy("cost", "asc").get();
  const rewards = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return res.json({ ok: true, rewards });
});


// ===============================================================
//  REDEEM REWARD
// ===============================================================
app.post("/redeemReward", async (req, res) => {
  const { userId, rewardId } = req.body;

  if (!userId || !rewardId) return res.json({ ok: false, error: "Invalid parameters" });

  const userRef = db.collection("users").doc(userId);
  const rewardRef = db.collection("rewards").doc(rewardId);

  const userSnap = await userRef.get();
  const rewardSnap = await rewardRef.get();

  if (!rewardSnap.exists) return res.json({ ok: false, error: "Reward not found" });

  const cost = rewardSnap.data().cost;
  const current = userSnap.exists ? (userSnap.data().omega || 0) : 0;

  if (current < cost) return res.json({ ok: false, error: "Not enough Omega Points" });

  const updated = current - cost;

  await userRef.set({ omega: updated }, { merge: true });
  await db.collection("omegaHistory").add({
    userId,
    rewardId,
    change: -cost,
    newTotal: updated,
    type: "REDEEM",
    timestamp: Date.now()
  });

  return res.json({ ok: true, omega: updated });
});


// ===============================================================
//  START SERVER
// ===============================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`Backend Vitrio ONLINE su porta ${PORT}`)
);
