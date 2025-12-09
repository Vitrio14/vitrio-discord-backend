import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

// 🔥 Inserisci BOT_TOKEN come variabile env su Render
const BOT_TOKEN = process.env.BOT_TOKEN;

// 🔥 Il tuo server Discord
const GUILD_ID = "821024627391463504";

// ==========================
// 🔎 GET USER BASIC INFO
// ==========================
app.get("/getUserInfo", async (req, res) => {
  const userId = req.query.userId;

  if (!userId) return res.json({ error: "Missing userId" });

  try {
    // recupera info utente
    const user = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    }).then(r => r.json());

    // recupera info membro nel server
    const member = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
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
        joined_at: member.joined_at
      }
    });

  } catch (err) {
    console.error(err);
    return res.json({ error: "Server error" });
  }
});

// ==========================
// SERVER START
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Backend Discord API ONLINE su Render, porta:", PORT));
