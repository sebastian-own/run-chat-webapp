const STORAGE_KEY = "foundry-chat-settings";
const DEFAULTS = {
  endpoint: "",
  model: "",
  apikey: "",
  system: ""
};

const $ = (id) => document.getElementById(id);
const chatEl = $("chat");
const inputEl = $("input");
const composer = $("composer");
const sendBtn = $("send-btn");
const clearBtn = $("clear-btn");
const settingsBtn = $("settings-btn");
const settingsDialog = $("settings-dialog");
const cancelBtn = $("cancel-btn");

let messages = []; // {role, content}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULTS, ...s };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

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

$("settings-form").addEventListener("submit", (e) => {
  // dialog form auto-closes; save before close
  saveSettings({
    endpoint: $("endpoint").value.trim(),
    model: $("model").value.trim(),
    apikey: $("apikey").value,
    system: $("system").value
  });
});

function addMessage(role, content, opts = {}) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  if (opts.typing) div.classList.add("typing");
  div.textContent = content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

clearBtn.addEventListener("click", () => {
  messages = [];
  chatEl.innerHTML = "";
});

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
    addMessage("error", "Please configure endpoint, model, and API key in settings (⚙️).");
    openSettings();
    return;
  }

  inputEl.value = "";
  addMessage("user", text);
  messages.push({ role: "user", content: text });

  sendBtn.disabled = true;
  const typingEl = addMessage("assistant", "Thinking…", { typing: true });

  try {
    const reply = await callFoundry(settings, messages);
    typingEl.classList.remove("typing");
    typingEl.textContent = reply;
    messages.push({ role: "assistant", content: reply });
  } catch (err) {
    typingEl.remove();
    addMessage("error", "Error: " + (err.message || err));
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
});

// Build input array for Responses API (each item needs type: "message")
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
  // Standard OpenAI Responses API: output_text convenience field or output[].content[].text
  if (typeof data.output_text === "string" && data.output_text.length) {
    return data.output_text;
  }
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
  // Fallback to chat-completions-style
  if (data.choices && data.choices[0]) {
    const c = data.choices[0];
    if (c.message && c.message.content) return c.message.content;
    if (c.text) return c.text;
  }
  return JSON.stringify(data, null, 2);
}

async function callFoundry(settings, msgs) {
  const body = {
    model: settings.model,
    input: buildInput(msgs)
  };
  if (settings.system && settings.system.trim()) {
    body.instructions = settings.system;
  }

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
    if (data && data.error) {
      detail = data.error.message || data.error.code || JSON.stringify(data.error);
    } else {
      detail = text || res.statusText;
    }
    console.error("Foundry error response:", data);
    throw new Error(`${res.status} ${detail}`);
  }
  return extractText(data);
}

// Open settings automatically on first run
(function init() {
  const s = loadSettings();
  if (!s.endpoint || !s.model || !s.apikey) {
    setTimeout(openSettings, 100);
  }
})();
