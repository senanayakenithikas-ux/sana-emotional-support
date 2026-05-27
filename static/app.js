const messagesEl = document.getElementById("messages");

const inputEl = document.getElementById("message-input");

const sendBtn = document.getElementById("send-btn");

const composer = document.getElementById("composer");

const micBtn = document.getElementById("mic-btn");

const micHint = document.getElementById("mic-hint");

const statusDot = document.getElementById("status-dot");

const statusText = document.getElementById("status-text");

const voiceOutToggleBtn = document.getElementById("voice-out-toggle");

const themeToggleBtn = document.getElementById("theme-toggle");

const deleteHistoryBtn = document.getElementById("delete-history");

const deleteModal = document.getElementById("delete-modal");

const deleteCancelBtn = document.getElementById("delete-cancel");

const deleteConfirmBtn = document.getElementById("delete-confirm");

const toastEl = document.getElementById("toast");

const sidebar = document.getElementById("sidebar");

const sidebarBackdrop = document.getElementById("sidebar-backdrop");

const menuToggle = document.getElementById("menu-toggle");

const chatListEl = document.getElementById("chat-list");

const newChatBtn = document.getElementById("new-chat");

const voiceSelectEl = document.getElementById("voice-select");

const voicePreviewBtn = document.getElementById("voice-preview");



const THEME_KEY = "sana-theme";

const VOICE_KEY = "sana-voice-out";

const VOICE_URI_KEY = "sana-voice-uri";

const DEFAULT_VOICE_PATTERNS = [
  /Microsoft (Jenny|Aria) Natural/i,
  /Microsoft (Zira|Natasha|Aria)/i,
  /Google UK English Female/i,
  /Google US English/i,
  /Samantha/i,
  /Karen/i,
  /Daniel/i,
  /English.*Female/i,
];

const API_BASE = (window.SANA_API_BASE || "").replace(/\/$/, "");

const INPUT_MAX_PX =

  parseInt(

    getComputedStyle(document.documentElement).getPropertyValue("--composer-input-max-height"),

    10

  ) || 160;



let toastTimer = null;

let isBusy = false;

let mediaRecorder = null;

let audioChunks = [];

let activeChatId = null;



function api(path, options) {

  return fetch(API_BASE + path, options);

}



function registerServiceWorker() {

  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("/sw.js").catch((err) => {

    console.warn("Service worker registration failed:", err);

  });

}



function setStatus(state, text) {

  statusDot.className = "status-dot " + state;

  statusText.textContent = text;

}



function isDarkTheme() {

  return document.documentElement.getAttribute("data-theme") === "dark";

}



function applyTheme(dark) {

  if (dark) {

    document.documentElement.setAttribute("data-theme", "dark");

    localStorage.setItem(THEME_KEY, "dark");

  } else {

    document.documentElement.removeAttribute("data-theme");

    localStorage.setItem(THEME_KEY, "light");

  }

}



function toggleTheme() {

  applyTheme(!isDarkTheme());

}



function initTheme() {

  const saved = localStorage.getItem(THEME_KEY);

  const dark =

    saved === "dark" ||

    (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  applyTheme(dark);

}



function isVoiceOutEnabled() {

  return localStorage.getItem(VOICE_KEY) !== "false";

}



function applyVoiceOut(enabled) {

  localStorage.setItem(VOICE_KEY, enabled ? "true" : "false");

  voiceOutToggleBtn.setAttribute("aria-pressed", String(enabled));

  voiceOutToggleBtn.classList.toggle("icon-btn-active", enabled);

}



function toggleVoiceOut() {

  applyVoiceOut(!isVoiceOutEnabled());

}



function showToast(message) {

  toastEl.textContent = message;

  toastEl.classList.remove("hidden");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 3200);

}



function openSidebar() {

  sidebar.classList.add("is-open");

  sidebarBackdrop.classList.remove("hidden");

  sidebarBackdrop.classList.add("is-open");

  menuToggle.setAttribute("aria-expanded", "true");

  menuToggle.setAttribute("aria-label", "Close menu");

}



function closeSidebar() {

  sidebar.classList.remove("is-open");

  sidebarBackdrop.classList.add("hidden");

  sidebarBackdrop.classList.remove("is-open");

  menuToggle.setAttribute("aria-expanded", "false");

  menuToggle.setAttribute("aria-label", "Open menu");

}



function toggleSidebar() {

  if (sidebar.classList.contains("is-open")) closeSidebar();

  else openSidebar();

}



function openDeleteModal() {

  deleteModal.classList.remove("hidden");

  deleteConfirmBtn.disabled = false;

  deleteConfirmBtn.focus();

}



function closeDeleteModal() {

  deleteModal.classList.add("hidden");

}



function clearMessagesUi() {

  messagesEl.innerHTML = "";

}



function escapeHtml(text) {

  const d = document.createElement("div");

  d.textContent = text;

  return d.innerHTML;

}



function appendMessage(role, content) {

  const div = document.createElement("div");

  div.className = "message " + role;

  const label = role === "user" ? "You" : "Sana";

  div.innerHTML = `<span class="label">${label}</span>${escapeHtml(content)}`;

  messagesEl.appendChild(div);

  messagesEl.scrollTop = messagesEl.scrollHeight;

  return div;

}



function showTyping() {

  const div = document.createElement("div");

  div.className = "message assistant typing";

  div.id = "typing-indicator";

  div.textContent = "Sana is listening…";

  messagesEl.appendChild(div);

  messagesEl.scrollTop = messagesEl.scrollHeight;

  return div;

}



function removeTyping() {

  document.getElementById("typing-indicator")?.remove();

}



function getEnglishVoices() {

  if (!window.speechSynthesis) return [];

  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));

}



function pickDefaultVoice(voices) {

  for (const pattern of DEFAULT_VOICE_PATTERNS) {

    const match = voices.find((v) => pattern.test(v.name));

    if (match) return match;

  }

  return voices.find((v) => v.localService) || voices[0] || null;

}



function getSelectedSpeechVoice() {

  const voices = getEnglishVoices();

  if (!voices.length) return null;

  const saved = localStorage.getItem(VOICE_URI_KEY);

  if (saved) {

    const match = voices.find((v) => v.voiceURI === saved);

    if (match) return match;

  }

  return pickDefaultVoice(voices);

}



function formatVoiceLabel(voice) {

  return voice.name

    .replace(/^Microsoft\s+/i, "")

    .replace(/^Google\s+/i, "")

    .replace(/\s+-\s+English.*$/i, "");

}



function populateVoiceSelect() {

  if (!voiceSelectEl || !window.speechSynthesis) return;

  const voices = getEnglishVoices();

  const current = getSelectedSpeechVoice();

  voiceSelectEl.innerHTML = "";

  if (!voices.length) {

    const opt = document.createElement("option");

    opt.textContent = "No English voices found";

    voiceSelectEl.appendChild(opt);

    voiceSelectEl.disabled = true;

    if (voicePreviewBtn) voicePreviewBtn.disabled = true;

    return;

  }

  voiceSelectEl.disabled = false;

  if (voicePreviewBtn) voicePreviewBtn.disabled = false;

  const sorted = [...voices].sort((a, b) => a.name.localeCompare(b.name));

  for (const voice of sorted) {

    const opt = document.createElement("option");

    opt.value = voice.voiceURI;

    opt.textContent = formatVoiceLabel(voice);

    if (current && voice.voiceURI === current.voiceURI) opt.selected = true;

    voiceSelectEl.appendChild(opt);

  }

  if (!voiceSelectEl.value && sorted[0]) {

    voiceSelectEl.value = sorted[0].voiceURI;

    localStorage.setItem(VOICE_URI_KEY, sorted[0].voiceURI);

  }

}



function onVoiceSelectChange() {

  if (!voiceSelectEl?.value) return;

  localStorage.setItem(VOICE_URI_KEY, voiceSelectEl.value);

}



function previewVoice() {

  speak("Hello. I'm Sana, and I'm here to listen whenever you're ready.");

}



function speak(text) {

  if (!isVoiceOutEnabled() || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = 0.9;

  utterance.pitch = 1;

  const voice = getSelectedSpeechVoice();

  if (voice) utterance.voice = voice;

  window.speechSynthesis.speak(utterance);

}



function renderChatList(chats) {

  chatListEl.innerHTML = "";

  for (const chat of chats) {

    const li = document.createElement("li");

    const btn = document.createElement("button");

    btn.type = "button";

    btn.className = "chat-list-item" + (chat.id === activeChatId ? " active" : "");

    btn.dataset.chatId = chat.id;

    btn.textContent = chat.title || "New chat";

    btn.addEventListener("click", () => switchChat(chat.id));

    li.appendChild(btn);

    chatListEl.appendChild(li);

  }

}



async function fetchChats() {

  const res = await api("/api/chats");

  if (!res.ok) throw new Error("Failed to load chats");

  return res.json();

}



async function refreshChatList() {

  try {

    const data = await fetchChats();

    activeChatId = data.active_chat_id;

    renderChatList(data.chats || []);

  } catch (e) {

    console.error(e);

  }

}



async function loadChatMessages(chatId) {

  const res = await api(`/api/history?chat_id=${encodeURIComponent(chatId)}`);

  if (!res.ok) throw new Error("Failed to load messages");

  const data = await res.json();

  clearMessagesUi();

  for (const msg of data.messages || []) {

    if (msg.role === "user" || msg.role === "assistant") {

      appendMessage(msg.role, msg.content);

    }

  }

  return (data.messages || []).length > 0;

}



async function switchChat(chatId) {

  if (isBusy || chatId === activeChatId) {

    closeSidebar();

    return;

  }

  setStatus("busy", "Loading…");

  try {

    const res = await api(`/api/chats/${encodeURIComponent(chatId)}/activate`, {

      method: "POST",

    });

    if (!res.ok) throw new Error("Failed to switch chat");

    activeChatId = chatId;

    const hasHistory = await loadChatMessages(chatId);

    await refreshChatList();

    if (!hasHistory) await loadGreeting(false, chatId);

    setStatus("ready", "Ready to listen");

  } catch (e) {

    showToast("Could not open chat — try again");

    console.error(e);

    setStatus("ready", "Ready to listen");

  }

  closeSidebar();

}



async function createNewChat() {

  if (isBusy) return;

  setStatus("busy", "Starting new chat…");

  try {

    const res = await api("/api/chats", { method: "POST" });

    if (!res.ok) throw new Error("Failed to create chat");

    const data = await res.json();

    activeChatId = data.id;

    clearMessagesUi();

    await refreshChatList();

    await loadGreeting(false, activeChatId);

    setStatus("ready", "Ready to listen");

  } catch (e) {

    showToast("Could not create chat — try again");

    console.error(e);

    setStatus("ready", "Ready to listen");

  }

  closeSidebar();

}



async function sendMessage(text) {

  const trimmed = text.trim();

  if (!trimmed || isBusy || !activeChatId) return;



  isBusy = true;

  sendBtn.disabled = true;

  setStatus("busy", "Sana is thinking…");



  appendMessage("user", trimmed);

  inputEl.value = "";

  autoResizeInput();

  showTyping();



  try {

    const res = await api("/api/chat", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ message: trimmed, chat_id: activeChatId }),

    });

    if (!res.ok) {

      const err = await res.json().catch(() => ({}));

      throw new Error(err.detail || "Request failed");

    }

    const data = await res.json();

    activeChatId = data.chat_id || activeChatId;

    removeTyping();

    appendMessage("assistant", data.reply);

    speak(data.reply);

    await refreshChatList();

  } catch (e) {

    removeTyping();

    appendMessage("assistant", "I'm sorry — something went wrong on my end. Please try again in a moment.");

    console.error(e);

  } finally {

    isBusy = false;

    sendBtn.disabled = !inputEl.value.trim();

    setStatus("ready", "Ready to listen");

  }

}



function autoResizeInput() {

  inputEl.style.height = "auto";

  const max = INPUT_MAX_PX;

  const next = Math.min(inputEl.scrollHeight, max);

  inputEl.style.height = `${next}px`;

  inputEl.style.overflowY = inputEl.scrollHeight > max ? "auto" : "hidden";

  sendBtn.disabled = isBusy || !inputEl.value.trim();

}



async function loadGreeting(hasHistory, chatId) {

  if (hasHistory) return;

  const cid = chatId || activeChatId;

  if (!cid) return;

  try {

    const res = await api(`/api/greeting?chat_id=${encodeURIComponent(cid)}`);

    const data = await res.json();

    appendMessage("assistant", data.greeting);

    speak(data.greeting);

  } catch {

    appendMessage(

      "assistant",

      "Hello. I'm Sana, and I'm here to listen whenever you're ready."

    );

  }

}



async function deleteHistory() {

  if (!activeChatId) return;

  deleteConfirmBtn.disabled = true;

  const chatId = activeChatId;

  try {

    const res = await api(`/api/chats/${encodeURIComponent(chatId)}`, {

      method: "DELETE",

    });

    if (!res.ok) throw new Error("Delete failed");

    const data = await res.json();

    activeChatId = data.active_chat_id;

    closeDeleteModal();

    clearMessagesUi();

    await refreshChatList();

    if (activeChatId) {

      const hasHistory = await loadChatMessages(activeChatId);

      if (!hasHistory) await loadGreeting(false, activeChatId);

    }

    showToast("Conversation deleted");

  } catch (e) {

    showToast("Could not delete — try again");

    console.error(e);

  } finally {

    deleteConfirmBtn.disabled = false;

  }

}



async function transcribeAndSend(blob) {

  setStatus("busy", "Understanding your voice…");

  micHint.textContent = "Processing…";

  showTyping();



  const form = new FormData();

  form.append("file", blob, "recording.webm");



  try {

    const res = await api("/api/transcribe", { method: "POST", body: form });

    removeTyping();

    if (!res.ok) {

      const err = await res.json().catch(() => ({}));

      micHint.textContent = err.detail || "Couldn't catch that — try again.";

      micHint.classList.add("active");

      setStatus("ready", "Ready to listen");

      return;

    }

    const data = await res.json();

    inputEl.value = data.text;

    autoResizeInput();

    await sendMessage(data.text);

  } catch (e) {

    removeTyping();

    micHint.textContent = "Voice error — try typing instead.";

    console.error(e);

    setStatus("ready", "Ready to listen");

  } finally {

    micHint.textContent = "Hold the microphone button while you speak, then release.";

    micHint.classList.remove("active");

  }

}



async function startRecording() {

  if (isBusy) return;

  try {

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioChunks = [];

    mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });

    mediaRecorder.ondataavailable = (e) => {

      if (e.data.size > 0) audioChunks.push(e.data);

    };

    mediaRecorder.onstop = () => {

      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });

      if (blob.size > 0) transcribeAndSend(blob);

    };

    mediaRecorder.start();

    micBtn.classList.add("recording");

    micHint.textContent = "Listening… release when you're done.";

    micHint.classList.add("active");

  } catch {

    micHint.textContent = "Microphone access denied — use text instead.";

    micHint.classList.add("active");

  }

}



function stopRecording() {

  if (mediaRecorder?.state === "recording") {

    mediaRecorder.stop();

    micBtn.classList.remove("recording");

  }

}



function getSupportedMimeType() {

  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

  for (const t of types) {

    if (MediaRecorder.isTypeSupported(t)) return t;

  }

  return "";

}



composer.addEventListener("submit", (e) => {

  e.preventDefault();

  sendMessage(inputEl.value);

});



inputEl.addEventListener("input", autoResizeInput);

inputEl.addEventListener("keydown", (e) => {

  if (e.key === "Enter" && !e.shiftKey) {

    e.preventDefault();

    sendMessage(inputEl.value);

  }

});



micBtn.addEventListener("mousedown", startRecording);

micBtn.addEventListener("mouseup", stopRecording);

micBtn.addEventListener("mouseleave", stopRecording);

micBtn.addEventListener("touchstart", (e) => {

  e.preventDefault();

  startRecording();

});

micBtn.addEventListener("touchend", (e) => {

  e.preventDefault();

  stopRecording();

});



voiceOutToggleBtn?.addEventListener("click", toggleVoiceOut);

themeToggleBtn?.addEventListener("click", toggleTheme);

deleteHistoryBtn?.addEventListener("click", openDeleteModal);

deleteCancelBtn?.addEventListener("click", closeDeleteModal);

deleteConfirmBtn?.addEventListener("click", deleteHistory);

deleteModal?.addEventListener("click", (e) => {

  if (e.target === deleteModal) closeDeleteModal();

});

menuToggle?.addEventListener("click", toggleSidebar);

sidebarBackdrop?.addEventListener("click", closeSidebar);

newChatBtn?.addEventListener("click", createNewChat);

voiceSelectEl?.addEventListener("change", onVoiceSelectChange);

voicePreviewBtn?.addEventListener("click", previewVoice);



document.addEventListener("keydown", (e) => {

  if (e.key === "Escape") {

    if (!deleteModal.classList.contains("hidden")) closeDeleteModal();

    else if (sidebar.classList.contains("is-open")) closeSidebar();

  }

});



if (window.speechSynthesis) {

  const loadVoices = () => populateVoiceSelect();

  loadVoices();

  window.speechSynthesis.onvoiceschanged = loadVoices;

}



initTheme();

applyVoiceOut(isVoiceOutEnabled());

registerServiceWorker();



(async function init() {

  setStatus("busy", "Loading…");

  try {

    const data = await fetchChats();

    activeChatId = data.active_chat_id;

    if (!activeChatId) {

      const created = await api("/api/chats", { method: "POST" });

      const c = await created.json();

      activeChatId = c.id;

    }

    renderChatList(data.chats || []);

    const hasHistory = await loadChatMessages(activeChatId);

    await loadGreeting(hasHistory, activeChatId);

    await refreshChatList();

  } catch (e) {

    console.error(e);

    appendMessage(

      "assistant",

      "Hello. I'm Sana, and I'm here to listen whenever you're ready."

    );

  }

  setStatus("ready", "Ready to listen");

  autoResizeInput();

})();


