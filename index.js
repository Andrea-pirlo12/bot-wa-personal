import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import fs from "fs";

const PREFIX = process.env.PREFIX || "!";
const OWNER = process.env.OWNER_NUMBER || "628xxxxxxxxxx"; // format internasional

async function startBot() {
  // auth disimpan di folder ./auth (di Railway pakai Volume biar persistent)
  const { state, saveCreds, clearState } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false, // kita render manual
    browser: ["Ndra-Bot", "Chrome", "1.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    version
  });

  // Tampilkan QR saat pertama kali
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // tampilin QR di console Railway / lokal
      qrcode.generate(qr, { small: true });
      console.log("\nScan QR di WhatsApp → Linked Devices.\n");
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed. Reconnect:", shouldReconnect);
      if (shouldReconnect) startBot();
      else {
        console.log("Logged out. Clearing session…");
        try { fs.rmSync("./auth", { recursive: true, force: true }); } catch {}
      }
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp as personal bot.");
    }
  });

  // Helper: kirim teks
  const sendText = (jid, text, opts = {}) => sock.sendMessage(jid, { text, ...opts });

  // Auto reply sederhana
  sock.ev.on("messages.upsert", async ({ type, messages }) => {
    if (type !== "notify") return;
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const jid = m.key.remoteJid;
    const pushName = m.pushName || "Teman";
    const msgType = Object.keys(m.message)[0];
    const body =
      m.message.conversation ||
      m.message?.extendedTextMessage?.text ||
      m.message?.imageMessage?.caption ||
      m.message?.videoMessage?.caption ||
      "";

    // Auto-reply sapa
    const textLower = body.toLowerCase().trim();
    if (["p", "assalamualaikum", "halo", "hai", "hallo"].some(w => textLower.startsWith(w))) {
      await sendText(jid, `Halo ${pushName}! Ketik *${PREFIX}menu* buat lihat perintah 😊`);
    }

    // Command handler
    if (!body.startsWith(PREFIX)) return;
    const args = body.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (args.shift() || "").toLowerCase();

    try {
      if (cmd === "menu" || cmd === "help") {
        const menuText =
`*Ndra Personal Bot* ✅
Prefix: ${PREFIX}

• ${PREFIX}ping        → cek bot
• ${PREFIX}say <teks>  → bot ngomong
• ${PREFIX}id          → lihat ID chat
• ${PREFIX}time        → jam server
• ${PREFIX}owner       → kontak owner

Tips:
- Bot ini personal, jangan spam ya 😸
`;
        await sendText(jid, menuText);
      }

      else if (cmd === "ping") {
        const t1 = Date.now();
        const m2 = await sendText(jid, "Pong…");
        const t2 = Date.now();
        await sendText(jid, `Latency: ${t2 - t1} ms`);
      }

      else if (cmd === "say") {
        if (args.length === 0) return sendText(jid, `Contoh: *${PREFIX}say aku rindu futsal*`);
        await sendText(jid, args.join(" "));
      }

      else if (cmd === "id") {
        await sendText(jid, `ID chat: ${jid}`);
      }

      else if (cmd === "time") {
        await sendText(jid, `Waktu server: ${new Date().toLocaleString()}`);
      }

      else if (cmd === "owner") {
        await sendText(jid, `Owner: wa.me/${OWNER.replace(/\D/g, "")}`);
      }

      else {
        await sendText(jid, `Perintah *${cmd}* tidak dikenali. Coba *${PREFIX}menu*`);
      }
    } catch (e) {
      console.error("Command error:", e);
      await sendText(jid, "⚠️ Terjadi error saat eksekusi perintah.");
    }
  });
}

startBot().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
