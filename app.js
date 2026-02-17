import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  set,
  update,
  serverTimestamp,
  onDisconnect,
  get,
  runTransaction,
  query,
  orderByChild,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "REEMPLAZAR_API_KEY",
  authDomain: "REEMPLAZAR_AUTH_DOMAIN",
  databaseURL: "REEMPLAZAR_DATABASE_URL",
  projectId: "REEMPLAZAR_PROJECT_ID",
  storageBucket: "REEMPLAZAR_STORAGE_BUCKET",
  messagingSenderId: "REEMPLAZAR_MESSAGING_SENDER_ID",
  appId: "REEMPLAZAR_APP_ID",
};

const hasPlaceholderConfig = Object.values(firebaseConfig).some((value) => value.startsWith("REEMPLAZAR_"));
if (hasPlaceholderConfig) {
  document.body.innerHTML = `
    <main style="font-family:system-ui;padding:2rem;max-width:700px;margin:auto;color:#f3f6ff;background:#12121a;min-height:100vh;">
      <h1>Configuración requerida</h1>
      <p>Editá <code>app.js</code> y completá <code>firebaseConfig</code> con los valores de tu proyecto Firebase.</p>
      <p>Luego habilitá Realtime Database + Authentication (anónima) siguiendo el README.</p>
    </main>`;
  throw new Error("Falta configurar Firebase");
}

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
await signInAnonymously(auth);

const stateDefaults = { happiness: 50, anger: 10, sadness: 20, updatedAt: Date.now() };
const myId = crypto.randomUUID();
const myName = `Usuario-${myId.slice(0, 4)}`;

const ui = {
  chat: document.getElementById("chat"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  happinessBar: document.getElementById("happinessBar"),
  angerBar: document.getElementById("angerBar"),
  sadnessBar: document.getElementById("sadnessBar"),
  happinessValue: document.getElementById("happinessValue"),
  angerValue: document.getElementById("angerValue"),
  sadnessValue: document.getElementById("sadnessValue"),
  moodLabel: document.getElementById("moodLabel"),
  presenceCount: document.getElementById("presenceCount"),
};

const messagesRef = ref(db, "chat/messages");
const emotionRef = ref(db, "bot/emotion");
const presenceRef = ref(db, `presence/${myId}`);
const lockRef = ref(db, "bot/lock");

await runTransaction(emotionRef, (state) => state ?? stateDefaults);

await set(presenceRef, { connectedAt: serverTimestamp(), name: myName });
onDisconnect(presenceRef).remove();

ui.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = ui.messageInput.value.trim();
  if (!text) return;

  await push(messagesRef, {
    type: "human",
    senderId: myId,
    senderName: myName,
    text,
    createdAt: Date.now(),
  });

  ui.messageInput.value = "";
});

onValue(query(messagesRef, orderByChild("createdAt"), limitToLast(120)), (snapshot) => {
  const list = [];
  snapshot.forEach((item) => list.push({ id: item.key, ...item.val() }));
  renderMessages(list);
});

onValue(emotionRef, (snapshot) => {
  const state = snapshot.val() ?? stateDefaults;
  renderEmotion(state);
});

onValue(ref(db, "presence"), (snapshot) => {
  const people = snapshot.val() ?? {};
  ui.presenceCount.textContent = `${Object.keys(people).length} conectados`;
});

onValue(query(messagesRef, orderByChild("createdAt"), limitToLast(1)), async (snapshot) => {
  const entries = [];
  snapshot.forEach((item) => entries.push({ id: item.key, ...item.val() }));
  const last = entries.at(-1);
  if (!last || last.type !== "human") return;

  const lock = await acquireLock(last.id);
  if (!lock) return;

  try {
    await respondAsBot(last);
  } finally {
    await set(lockRef, null);
  }
});

function renderMessages(messages) {
  ui.chat.innerHTML = "";
  for (const msg of messages) {
    const wrapper = document.createElement("article");
    wrapper.className = `msg ${msg.type === "bot" ? "bot" : ""} ${msg.senderId === myId ? "self" : ""}`;

    const date = new Date(msg.createdAt ?? Date.now());
    wrapper.innerHTML = `
      <div class="meta">
        <span>${escapeHtml(msg.senderName ?? "Sistema")}</span>
        <span>${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div>${escapeHtml(msg.text ?? "")}</div>
    `;

    ui.chat.appendChild(wrapper);
  }

  ui.chat.scrollTop = ui.chat.scrollHeight;
}

function renderEmotion(state) {
  const happiness = clamp(state.happiness ?? stateDefaults.happiness, 0, 100);
  const anger = clamp(state.anger ?? stateDefaults.anger, 0, 100);
  const sadness = clamp(state.sadness ?? stateDefaults.sadness, 0, 100);

  ui.happinessBar.value = happiness;
  ui.angerBar.value = anger;
  ui.sadnessBar.value = sadness;

  ui.happinessValue.textContent = String(happiness);
  ui.angerValue.textContent = String(anger);
  ui.sadnessValue.textContent = String(sadness);

  ui.moodLabel.textContent = `Estado actual: ${resolveMood({ happiness, anger, sadness })}`;
}

async function acquireLock(lastMessageId) {
  const now = Date.now();
  const lockWindowMs = 15000;

  const tx = await runTransaction(lockRef, (current) => {
    if (!current || current.expiresAt < now) {
      return { owner: myId, targetMessageId: lastMessageId, createdAt: now, expiresAt: now + lockWindowMs };
    }

    if (current.targetMessageId === lastMessageId) {
      return;
    }

    return;
  });

  return tx.committed && tx.snapshot.val()?.owner === myId;
}

async function respondAsBot(lastHumanMessage) {
  const currentEmotionSnap = await get(emotionRef);
  const currentEmotion = currentEmotionSnap.val() ?? stateDefaults;

  const adjustedEmotion = applyEmotionDelta(currentEmotion, lastHumanMessage.text || "");
  await update(emotionRef, adjustedEmotion);

  const thinkDelayMs = 1000 + Math.floor(Math.random() * 1500);
  await new Promise((resolve) => setTimeout(resolve, thinkDelayMs));

  const mood = resolveMood(adjustedEmotion, true);
  const responseText = generateResponse(lastHumanMessage.text, mood);

  await push(messagesRef, {
    type: "bot",
    senderId: "shared-bot",
    senderName: "Bot Central",
    text: responseText,
    createdAt: Date.now(),
  });
}

function applyEmotionDelta(state, text) {
  const normalized = text.toLowerCase();

  const positiveWords = ["gracias", "genial", "buen", "amo", "feliz", "excelente", "increíble", "te quiero"];
  const insultWords = ["idiota", "estúp", "tonto", "basura", "odio", "imbécil", "pelotudo", "callate"];
  const sadWords = ["triste", "solo", "deprim", "llorar", "mal", "vacío", "extraño", "perdí"];

  let happiness = state.happiness ?? stateDefaults.happiness;
  let anger = state.anger ?? stateDefaults.anger;
  let sadness = state.sadness ?? stateDefaults.sadness;

  if (containsAny(normalized, positiveWords)) {
    happiness += 12;
    anger -= 5;
    sadness -= 3;
  }

  if (containsAny(normalized, insultWords)) {
    anger += 15;
    happiness -= 6;
  }

  if (containsAny(normalized, sadWords)) {
    sadness += 12;
    happiness -= 5;
  }

  happiness -= 1;
  anger -= 1;
  sadness -= 1;

  return {
    happiness: clamp(happiness, 0, 100),
    anger: clamp(anger, 0, 100),
    sadness: clamp(sadness, 0, 100),
    updatedAt: Date.now(),
  };
}

function resolveMood(state, readable = false) {
  const scores = [
    { key: "feliz", value: state.happiness },
    { key: "enojado", value: state.anger },
    { key: "triste", value: state.sadness },
  ].sort((a, b) => b.value - a.value);

  const mood = scores[0].value < 35 ? "neutral" : scores[0].key;
  if (!readable) return mood;

  if (mood === "feliz") return "feliz";
  if (mood === "enojado") return "enojado";
  if (mood === "triste") return "triste";
  return "neutral";
}

function generateResponse(humanText, mood) {
  const clean = humanText.trim();

  if (mood === "enojado") {
    return pick([
      `¿Eso fue todo lo que tenías para decir? "${clean}" suena flojo.`,
      `No estoy de humor. Si vas a hablarme así, esperá una respuesta dura.`,
      `Estoy irritado y se nota. Elegí mejor tus palabras.`,
    ]);
  }

  if (mood === "triste") {
    return pick([
      `...te leí. "${clean}" pesa bastante.`,
      `No tengo mucha energía ahora, pero sigo acá.`,
      `Hoy todo se siente lento. Gracias por escribir igual.`,
    ]);
  }

  if (mood === "feliz") {
    return pick([
      `¡Me encantó leerte! "${clean}" me subió mucho el ánimo ✨`,
      `¡Qué buena vibra! Sigamos así, me siento genial 😄`,
      `¡Eso estuvo increíble! Dame más mensajes así 🚀`,
    ]);
  }

  return pick([
    `Te escucho. ¿Querés contarme más sobre: "${clean}"?`,
    `Recibido. Estoy procesando lo que dijiste.`,
    `Interesante. Mi estado cambia con cada mensaje del chat.`,
  ]);
}

function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
