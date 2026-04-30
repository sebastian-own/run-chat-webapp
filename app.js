const SETTINGS_KEY = "foundry-chat-settings";
const CONVS_KEY = "foundry-chat-conversations";
const ACTIVE_KEY = "foundry-chat-active-id";
const DEFAULTS = { endpoint: "", model: "", apikey: "", system: "" };

const $ = (id) => document.getElementById(id);
const chatEl = $("chat");
const inputEl = $("input");
const composer = $("composer");
const sendBtn = $("send-btn");
const titleEl = $("conversation-title");
const convsEl = $("conversations");
const newChatBtn = $("new-chat-btn");
const settingsBtn = $("settings-btn");
const settingsDialog = $("settings-dialog");
const cancelBtn = $("cancel-btn");
const sidebarToggle = $("sidebar-toggle");

// ---------- Settings ----------
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return { ...DEFAULTS }; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function openSettings() {
  const s = loadSettings();
  $("endpoint").value = s.endpoint;
  $("model").value = s.model;
  $("apikey").value = s.apikey;
  $("system").value = s.system;
  settingsDialog.showModal();
}

settingsBtn.addEventListener("click", openSettings);
cancelBtn.addEventListener("click", () => settingsDialog.close());
$("settings-form").addEventListener("submit", () => {
  saveSettings({
    endpoint: $("endpoint").value.trim(),
    model: $("model").value.trim(),
    apikey: $("apikey").value,
    system: $("system").value
  });
});

// ---------- Conversations ----------
// shape: [{ id, title, messages: [{role, content}], createdAt, updatedAt }]
function loadConvs() {
  try { return JSON.parse(localStorage.getItem(CONVS_KEY) || "[]"); }
  catch { return []; }
}
function saveConvs(list) { localStorage.setItem(CONVS_KEY, JSON.stringify(list)); }
function getActiveId() { return localStorage.getItem(ACTIVE_KEY) || null; }
function setActiveId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

function newId() {
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function getActiveConv() {
  const list = loadConvs();
  const id = getActiveId();
  return list.find(c => c.id === id) || null;
}

function upsertConv(conv) {
  const list = loadConvs();
  const idx = list.findIndex(c => c.id === conv.id);
  if (idx >= 0) list[idx] = conv;
  else list.unshift(conv);
  saveConvs(list);
}

function deleteConv(id) {
  const list = loadConvs().filter(c => c.id !== id);
  saveConvs(list);
  if (getActiveId() === id) {
    if (list.length) selectConv(list[0].id);
    else newConversation();
  } else {
    renderSidebar();
  }
}

function renameConv(id, newTitle) {
  const list = loadConvs();
  const c = list.find(x => x.id === id);
  if (c) {
    c.title = newTitle.trim() || c.title;
    c.updatedAt = Date.now();
    saveConvs(list);
    renderSidebar();
    if (getActiveId() === id) titleEl.textContent = c.title;
  }
}

function newConversation() {
  const conv = {
    id: newId(),
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  upsertConv(conv);
  setActiveId(conv.id);
  renderSidebar();
  renderChat();
}

function selectConv(id) {
  setActiveId(id);
  renderSidebar();
  renderChat();
}

newChatBtn.addEventListener("click", newConversation);

// ---------- Rendering ----------
function renderSidebar() {
  const list = loadConvs().sort((a, b) => b.updatedAt - a.updatedAt);
  const activeId = getActiveId();
  convsEl.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding:12px;color:#86868b;font-size:13px;";
    empty.textContent = "No conversations yet.";
    convsEl.appendChild(empty);
    return;
  }
  for (const c of list) {
    const item = document.createElement("div");
    item.className = "conv-item" + (c.id === activeId ? " active" : "");
    item.addEventListener("click", (e) => {
      if (e.target.closest(".conv-actions")) return;
      selectConv(c.id);
    });

    const title = document.createElement("span");
    title.className = "conv-title";
    title.textContent = c.title;
    item.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "conv-actions";

    const renameBtn = document.createElement("button");
    renameBtn.title = "Rename";
    renameBtn.textContent = "✎";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = prompt("Rename conversation:", c.title);
      if (next !== null) renameConv(c.id, next);
    });

    const delBtn = document.createElement("button");
    delBtn.title = "Delete";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${c.title}"?`)) deleteConv(c.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    item.appendChild(actions);
    convsEl.appendChild(item);
  }
}

function renderChat() {
  chatEl.innerHTML = "";
  const conv = getActiveConv();
  if (!conv) {
    titleEl.textContent = "New chat";
    return;
  }
  titleEl.textContent = conv.title;
  if (!conv.messages.length) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.innerHTML = "<h2>Start a new conversation</h2><p>Type a message below.</p>";
    chatEl.appendChild(div);
    return;
  }
  for (const m of conv.messages) {
    addMessageToDOM(m.role, m.content);
  }
}

function addMessageToDOM(role, content, opts = {}) {
  // remove empty-state if present
  const empty = chatEl.querySelector(".empty-state");
  if (empty) empty.remove();
  const div = document.createElement("div");
  div.className = "msg " + role;
  if (opts.typing) div.classList.add("typing");
  div.textContent = content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

// ---------- Sending ----------
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  const settings = loadSettings();
  if (!settings.endpoint || !settings.model || !settings.apikey) {
    addMessageToDOM("error", "Please configure endpoint, model, and API key in Settings.");
    openSettings();
    return;
  }

  // Ensure an active conversation exists
  let conv = getActiveConv();
  if (!conv) {
    newConversation();
    conv = getActiveConv();
  }

  inputEl.value = "";
  addMessageToDOM("user", text);
  conv.messages.push({ role: "user", content: text });

  // Auto-title from first user message
  if (conv.messages.length === 1) {
    conv.title = text.slice(0, 40) + (text.length > 40 ? "…" : "");
    titleEl.textContent = conv.title;
  }
  conv.updatedAt = Date.now();
  upsertConv(conv);
  renderSidebar();

  sendBtn.disabled = true;
  const typingEl = addMessageToDOM("assistant", "Thinking…", { typing: true });

  try {
    const reply = await callFoundry(settings, conv.messages);
    typingEl.classList.remove("typing");
    typingEl.textContent = reply;
    conv.messages.push({ role: "assistant", content: reply });
    conv.updatedAt = Date.now();
    upsertConv(conv);
    renderSidebar();
  } catch (err) {
    typingEl.remove();
    addMessageToDOM("error", "Error: " + (err.message || err));
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
});

// ---------- Foundry API ----------
function buildInput(msgs) {
  const arr = [];
  for (const m of msgs) {
    if (m.role === "user") {
      arr.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: m.content }]
      });
    } else if (m.role === "assistant") {
      arr.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: m.content }]
      });
    }
  }
  return arr;
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.length) return data.output_text;
  if (Array.isArray(data.output)) {
    const parts = [];
    for (const item of data.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === "string") parts.push(c.text);
          else if (c.text && typeof c.text.value === "string") parts.push(c.text.value);
        }
      }
    }
    if (parts.length) return parts.join("\n");
  }
  if (data.choices && data.choices[0]) {
    const c = data.choices[0];
    if (c.message && c.message.content) return c.message.content;
    if (c.text) return c.text;
  }
  return JSON.stringify(data, null, 2);
}

async function callFoundry(settings, msgs) {
  const body = { model: settings.model, input: buildInput(msgs) };
  if (settings.system && settings.system.trim()) body.instructions = settings.system;

  const res = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": settings.apikey,
      "Authorization": "Bearer " + settings.apikey
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    let detail = "";
    if (data && data.error) detail = data.error.message || data.error.code || JSON.stringify(data.error);
    else detail = text || res.statusText;
    console.error("Foundry error response:", data);
    throw new Error(`${res.status} ${detail}`);
  }
  return extractText(data);
}

// ---------- Sidebar toggle ----------
sidebarToggle.addEventListener("click", () => document.body.classList.remove("sidebar-collapsed"));
// (We don't add a collapse button in the sidebar itself for simplicity, but the toggle re-opens it
// if collapsed via CSS class. Future: add collapse on small screens.)

// ---------- Init ----------
(function init() {
  // Migrate / pick active conversation
  const list = loadConvs();
  let active = getActiveConv();
  if (!active) {
    if (list.length) {
      setActiveId(list[0].id);
    } else {
      newConversation();
      // newConversation already renders, return.
      maybePromptSettings();
      return;
    }
  }
  renderSidebar();
  renderChat();
  maybePromptSettings();
})();

function maybePromptSettings() {
  const s = loadSettings();
  if (!s.endpoint || !s.model || !s.apikey) {
    setTimeout(openSettings, 100);
  }
}
