// ================================
//  VITRIO BACKEND COMPLETO
//  Discord API + Omega Points + Shop
// ================================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import admin from "firebase-admin";
import fs from "fs";

// Carica serviceAccountKey.json tramite fs
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
app.use(cors());
app.use(express.json());

// ================================
//  DISCORD CONFIG
// ================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = "821024627391463504";

// ================================
//  HELPERS
// ================================
function success(res, data) {
  return res.json({ ok: true, ...data });
}

function fail(res, message) {
  return res.json({ ok: false, error: message });
}

// ================================
//  API 1 — GET USER DISCORD INFO
// ================================
app.get("/getUserInfo", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return fail(res, "Missing userId");

  try {
    // USER BASE INFO
    const user = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    }).then(r => r.json());

    // MEMBER INFO (ruoli)
    const member = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    ).then(r => r.json());

    return success(res, {
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
    console.error("Errore Discord:", err);
    return fail(res, "Discord API error");
  }
});

// ================================
//  API 2 — GET Omega Points
// ================================
app.get("/getOmega", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return fail(res, "Missing userId");

  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();

  return success(res, {
    omega: snap.exists ? (snap.data().omega || 0) : 0
  });
});

// ================================
//  API 3 — ADD Omega Points
// ================================
app.post("/addOmega", async (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || typeof amount !== "number") {
    return fail(res, "Invalid parameters");
  }

  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data().omega || 0) : 0;

  const updated = current + amount;

  await ref.set({ omega: updated }, { merge: true });

  // Storico transazioni
  await db.collection("omegaHistory").add({
    userId,
    change: amount,
    newTotal: updated,
    type: "ADD",
    timestamp: Date.now()
  });

  return success(res, {
    message: `Aggiunti ${amount} Omega Points`,
    omega: updated
  });
});

// ================================
//  API 4 — REMOVE Omega Points
// ================================
app.post("/removeOmega", async (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || typeof amount !== "number") {
    return fail(res, "Invalid parameters");
  }

  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  const current = snap.exists ? (snap.data().omega || 0) : 0;

  const updated = Math.max(0, current - amount);

  await ref.set({ omega: updated }, { merge: true });

  // Storico transazioni
  await db.collection("omegaHistory").add({
    userId,
    change: -amount,
    newTotal: updated,
    type: "REMOVE",
    timestamp: Date.now()
  });

  return success(res, {
    message: `Rimossi ${amount} Omega Points`,
    omega: updated
  });
});

// ================================
//  API 5 — SET Omega Points (ADMIN)
// ================================
app.post("/setOmega", async (req, res) => {
  const { userId, value } = req.body;

  if (!userId || typeof value !== "number") {
    return fail(res, "Invalid parameters");
  }

  await db.collection("users").doc(userId).set({ omega: value }, { merge: true });

  await db.collection("omegaHistory").add({
    userId,
    change: value,
    newTotal: value,
    type: "SET",
    timestamp: Date.now()
  });

  return success(res, {
    message: `Omega Points impostati a ${value}`,
    omega: value
  });
});

// ================================
//  API 6 — GET Storico Omega Points
// ================================
app.get("/getOmegaHistory", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return fail(res, "Missing userId");

  const snap = await db.collection("omegaHistory")
    .where("userId", "==", userId)
    .orderBy("timestamp", "desc")
    .limit(50)
    .get();

  const list = snap.docs.map(d => d.data());

  return success(res, { history: list });
});

// ================================
//  API 7 — GET Rewards (Premi)
// ================================
app.get("/getRewards", async (req, res) => {
  const snap = await db.collection("rewards").orderBy("cost", "asc").get();
  const rewards = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return success(res, { rewards });
});

// ================================
//  API 8 — Redeem Reward (Riscatta premio)
// ================================
app.post("/redeemReward", async (req, res) => {
  const { userId, rewardId } = req.body;

  if (!userId || !rewardId) return fail(res, "Invalid parameters");

  const userRef = db.collection("users").doc(userId);
  const rewardRef = db.collection("rewards").doc(rewardId);

  const userSnap = await userRef.get();
  const rewardSnap = await rewardRef.get();

  if (!rewardSnap.exists) return fail(res, "Reward not found");

  const cost = rewardSnap.data().cost;
  const current = userSnap.exists ? (userSnap.data().omega || 0) : 0;

  if (current < cost) return fail(res, "Not enough Omega Points");

  const updated = current - cost;

  await userRef.set({ omega: updated }, { merge: true });

  await db.collection("omegaHistory").add({
    userId,
    change: -cost,
    newTotal: updated,
    rewardId,
    type: "REDEEM",
    timestamp: Date.now()
  });

  return success(res, {
    message: "Premio riscattato con successo",
    omega: updated
  });
});

// ================================
//  START SERVER
// ================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`Backend Vitrio ONLINE su porta ${PORT}`)
);
