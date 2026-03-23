const els = {
  connectionDot: document.getElementById("connectionDot"),
  connectionText: document.getElementById("connectionText"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  task: document.getElementById("task"),
  watchTarget: document.getElementById("watchTarget"),
  previewWrap: document.getElementById("previewWrap"),
  previewFrame: document.getElementById("previewFrame"),
  previewState: document.getElementById("previewState"),
  health: document.getElementById("health"),
  food: document.getElementById("food"),
  healthBar: document.getElementById("healthBar"),
  foodBar: document.getElementById("foodBar"),
  position: document.getElementById("position"),
  players: document.getElementById("players"),
  inventory: document.getElementById("inventory"),
  logs: document.getElementById("logs"),
  clearLogsBtn: document.getElementById("clearLogsBtn"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  guardBtn: document.getElementById("guardBtn"),
  gotoInput: document.getElementById("gotoInput"),
  gotoBtn: document.getElementById("gotoBtn"),
  mineInput: document.getElementById("mineInput"),
  mineBtn: document.getElementById("mineBtn"),
  dropInput: document.getElementById("dropInput"),
  dropBtn: document.getElementById("dropBtn"),
  configBtn: document.getElementById("configBtn"),
  configModal: document.getElementById("configModal"),
  configForm: document.getElementById("configForm"),
  closeConfig: document.getElementById("closeConfig"),
  cfgUsername: document.getElementById("cfgUsername"),
  cfgHost: document.getElementById("cfgHost"),
  cfgPort: document.getElementById("cfgPort"),
  cfgAuth: document.getElementById("cfgAuth"),
  serverLabel: document.getElementById("serverLabel")
};

let socket;
let logs = [];

function api(path, method = "GET", body) {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  }).then((r) => r.json());
}

function renderStatus(status) {
  els.task.textContent = status.task;
  els.watchTarget.textContent = status.watchTarget || "Nobody";

  if (status.previewActive && status.previewPort) {
    const url = `http://${location.hostname}:${status.previewPort}`;
    if (els.previewFrame.dataset.src !== url) {
      els.previewFrame.dataset.src = url;
      els.previewFrame.src = url;
    }
    els.previewWrap.classList.remove("is-offline");
    els.previewState.textContent = `Live :${status.previewPort}`;
  } else {
    els.previewWrap.classList.add("is-offline");
    els.previewState.textContent = "Unavailable";
  }

  els.health.textContent = `${status.health.toFixed(1)}/20`;
  els.food.textContent = `${status.food}/20`;
  els.healthBar.style.width = `${Math.max(0, Math.min(100, (status.health / 20) * 100))}%`;
  els.foodBar.style.width = `${Math.max(0, Math.min(100, (status.food / 20) * 100))}%`;
  els.position.textContent = status.position ? `${status.position.x} ${status.position.y} ${status.position.z}` : "-";

  if (status.online) {
    els.connectionDot.classList.add("online");
    els.connectionText.textContent = "Connected";
  } else {
    els.connectionDot.classList.remove("online");
    els.connectionText.textContent = "Offline";
  }

  els.guardBtn.classList.toggle("active", Boolean(status.guardMode));

  if (!status.players.length) {
    els.players.className = "list empty";
    els.players.textContent = "No players nearby";
  } else {
    els.players.className = "list";
    els.players.replaceChildren(...status.players.map((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<span>${name}</span><span>↗</span>`;
      btn.addEventListener("click", () => sendCommand("goto", [name]));
      return btn;
    }));
  }

  if (!status.inventory.length) {
    els.inventory.className = "list empty";
    els.inventory.textContent = "Empty";
  } else {
    els.inventory.className = "list";
    els.inventory.replaceChildren(...status.inventory.map((item) => {
      const row = document.createElement("div");
      row.textContent = `${item.name} x${item.count}`;
      return row;
    }));
  }
}

function levelClass(level) {
  return ["info", "success", "warn", "error", "chat", "system"].includes(level) ? level : "system";
}

function renderLogs() {
  if (!logs.length) {
    els.logs.textContent = "No logs yet - connect the bot to get started.";
    return;
  }

  els.logs.classList.remove("empty");
  els.logs.replaceChildren(...logs.map((entry) => {
    const row = document.createElement("div");
    row.className = `log ${levelClass(entry.level)}`;
    const time = new Date(entry.ts).toLocaleTimeString();
    row.textContent = `[${time}] ${entry.message}`;
    return row;
  }));

  els.logs.scrollTop = els.logs.scrollHeight;
}

async function sendCommand(command, args = []) {
  await api("/api/command", "POST", { command, args });
}

function connectWS() {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  const scheme = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${scheme}://${location.host}/ws`);

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "status") renderStatus(msg.data);
      if (msg.type === "logs") {
        logs = msg.data;
        renderLogs();
      }
      if (msg.type === "log") {
        logs.push(msg.data);
        if (logs.length > 600) logs.shift();
        renderLogs();
      }
      if (msg.type === "config") {
        applyConfig(msg.data);
      }
    } catch {
      // ignore malformed event
    }
  };

  socket.onclose = () => {
    setTimeout(connectWS, 3000);
  };
}

function applyConfig(cfg) {
  els.cfgUsername.value = cfg.username;
  els.cfgHost.value = cfg.host;
  els.cfgPort.value = String(cfg.port);
  els.cfgAuth.value = cfg.auth;
  els.serverLabel.textContent = `${cfg.host}:${cfg.port}`;
}

document.querySelectorAll("[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const cmd = btn.getAttribute("data-cmd");
    if (!cmd) return;
    await sendCommand(cmd, []);
  });
});

els.connectBtn.addEventListener("click", async () => {
  await api("/api/connect", "POST");
});

els.disconnectBtn.addEventListener("click", async () => {
  await api("/api/disconnect", "POST");
});

els.chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message) return;
  await sendCommand("chat", [message]);
  els.chatInput.value = "";
});

els.clearLogsBtn.addEventListener("click", () => {
  logs = [];
  renderLogs();
});

els.gotoBtn.addEventListener("click", async () => {
  const name = els.gotoInput.value.trim();
  if (!name) return;
  await sendCommand("goto", [name]);
});

els.mineBtn.addEventListener("click", async () => {
  const block = els.mineInput.value.trim();
  if (!block) return;
  await sendCommand("mine", [block]);
});

els.dropBtn.addEventListener("click", async () => {
  const item = els.dropInput.value.trim();
  if (!item) return;
  await sendCommand("drop", [item]);
});

els.configBtn.addEventListener("click", () => {
  els.configModal.showModal();
});

els.closeConfig.addEventListener("click", () => {
  els.configModal.close();
});

els.configForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    username: els.cfgUsername.value.trim(),
    host: els.cfgHost.value.trim(),
    port: Number(els.cfgPort.value),
    auth: els.cfgAuth.value
  };
  await api("/api/config", "POST", payload);
  els.configModal.close();
});

(async function boot() {
  const [status, allLogs, cfg] = await Promise.all([
    api("/api/status"),
    api("/api/logs"),
    api("/api/config")
  ]);
  logs = allLogs;
  renderStatus(status);
  renderLogs();
  applyConfig(cfg);
  connectWS();
})();
