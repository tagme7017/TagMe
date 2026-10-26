const AppState = {
  fontSizeBase: 24,
  lastSpokenText: "¡Hola! Soy Tagme. ¿Cómo estás hoy?",
  isListening: false,
  iaReady: false,
  chatHistory: [],
  reminders: [],
  countdownVal: 15,
  countdownInterval: null,
  selectedVoice: null
};

const elements = {
  robotContainer: document.getElementById('robot-container'),
  dialogueText: document.getElementById('dialogue-text'),
  iaStatusDot: document.getElementById('ia-status-dot'),
  iaStatusLabel: document.getElementById('ia-status-label'),
  btnHablemos: document.getElementById('btn-hablemos'),
  btnEmergencia: document.getElementById('btn-emergencia'),
  btnRepetir: document.getElementById('btn-repetir'),
  btnFontInc: document.getElementById('btn-font-inc'),
  btnFontDec: document.getElementById('btn-font-dec'),
  modalChat: document.getElementById('modal-chat'),
  chatLog: document.getElementById('chat-log'),
  chatInputText: document.getElementById('chat-input-text'),
  btnChatSend: document.getElementById('btn-chat-send'),
  btnCloseChat: document.getElementById('btn-close-chat'),
  modalAgenda: document.getElementById('modal-agenda'),
  btnOpenAgenda: document.getElementById('btn-open-agenda'),
  btnCloseAgenda: document.getElementById('btn-close-agenda'),
  agendaList: document.getElementById('agenda-list'),
  modalEmergency: document.getElementById('modal-emergency-flow'),
  emergencyTimerNum: document.getElementById('emergency-timer-num'),
  btnCancelAlert: document.getElementById('btn-cancel-alert'),
  btnConfirmAlert: document.getElementById('btn-confirm-alert')
};

// ============================================================
// BUSCADOR DE LA VOZ MÁS HUMANA, DULCE Y AMIGABLE DISPONIBLE
// ============================================================
function loadBestFriendlyVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  // Priorizamos voces neuronales y naturales en español
  const preferred = voices.find(v => v.lang.includes('es') && (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Online')))
    || voices.find(v => v.lang === 'es-AR')
    || voices.find(v => v.lang.includes('es') && v.name.includes('Google'))
    || voices.find(v => v.lang.includes('es') && (v.name.includes('Sabina') || v.name.includes('Paulina') || v.name.includes('Helena') || v.name.includes('Mia')))
    || voices.find(v => v.lang.startsWith('es'));

  if (preferred) {
    AppState.selectedVoice = preferred;
    console.log('[TAGME Voz seleccionada]:', preferred.name, preferred.lang);
  }
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadBestFriendlyVoice;
  loadBestFriendlyVoice();
}

function speak(text) {
  AppState.lastSpokenText = text;
  elements.dialogueText.innerText = text;

  if (!('speechSynthesis' in window)) {
    setRobotState('disponible');
    return;
  }

  try {
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (AppState.selectedVoice) {
      utterance.voice = AppState.selectedVoice;
    }
    utterance.lang = 'es-AR';

    // Calibración acústica para máxima calidez y amabilidad:
    utterance.pitch = 1.08; // Tono ligeramente más alegre y dulce
    utterance.rate = 0.93;  // Ritmo pausado y paciente para adultos mayores

    utterance.onstart = () => setRobotState('hablando');
    utterance.onend = () => setRobotState('disponible');
    utterance.onerror = () => setRobotState('disponible');

    window.speechSynthesis.speak(utterance);

    setTimeout(() => {
      setRobotState('disponible');
    }, 8000);
  } catch (e) {
    setRobotState('disponible');
  }
}

async function checkBackendHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.status === 'ok' && data.geminiConfigured) {
      AppState.iaReady = true;
      elements.iaStatusDot.className = 'status-dot';
      elements.iaStatusLabel.innerText = 'IA conectada';
    } else {
      elements.iaStatusDot.className = 'status-dot error';
      elements.iaStatusLabel.innerText = 'Falta configurar clave';
    }
  } catch (e) {
    elements.iaStatusDot.className = 'status-dot error';
    elements.iaStatusLabel.innerText = 'Sin conexión';
  }
}

function setRobotState(state) {
  if (elements.robotContainer) {
    elements.robotContainer.className = 'robot-stage-container ' + state;
  }
}

async function sendToGemini(userMessage) {
  if (!userMessage.trim()) return;

  setRobotState('pensando');
  elements.iaStatusDot.className = 'status-dot loading';
  elements.iaStatusLabel.innerText = 'TAGME está pensando...';
  elements.dialogueText.innerText = 'Pensando...';

  appendChatMsg('user', userMessage);

  const safetyTimeout = setTimeout(() => {
    if (elements.dialogueText.innerText === 'Pensando...') {
      setRobotState('disponible');
      elements.iaStatusDot.className = 'status-dot';
      elements.iaStatusLabel.innerText = 'IA conectada';
      speak('Perdón la demora. ¿Querés preguntarme de nuevo?');
    }
  }, 10000);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        history: AppState.chatHistory
      })
    });

    clearTimeout(safetyTimeout);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Problema de respuesta.');

    const reply = data.reply;
    AppState.chatHistory.push({ role: 'user', text: userMessage });
    AppState.chatHistory.push({ role: 'model', text: reply });

    appendChatMsg('tagme', reply);
    elements.iaStatusDot.className = 'status-dot';
    elements.iaStatusLabel.innerText = 'IA conectada';

    speak(reply);
  } catch (err) {
    clearTimeout(safetyTimeout);
    elements.iaStatusDot.className = 'status-dot error';
    elements.iaStatusLabel.innerText = 'Reintentando...';
    speak('En este momento hay mucha demanda. ¿Querés que probemos en un ratito?');
  }
}

function appendChatMsg(sender, text) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender === 'user' ? 'bubble-user' : 'bubble-tagme'}`;
  bubble.innerText = text;
  elements.chatLog.appendChild(bubble);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    elements.btnHablemos.addEventListener('click', () => {
      elements.modalChat.style.display = 'flex';
    });
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.interimResults = false;

  elements.btnHablemos.addEventListener('click', () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }

    if (AppState.isListening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
      AppState.isListening = true;
      setRobotState('escuchando');
      elements.dialogueText.innerText = 'Te escucho...';
    } catch (e) {
      AppState.isListening = false;
      setRobotState('disponible');
    }
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    AppState.isListening = false;
    sendToGemini(transcript);
  };

  recognition.onerror = () => {
    AppState.isListening = false;
    setRobotState('disponible');
    speak('No te escuché bien. Por favor, tocá Hablemos de nuevo.');
  };

  recognition.onend = () => {
    AppState.isListening = false;
  };
}

function setupFontControls() {
  elements.btnFontInc.addEventListener('click', () => {
    if (AppState.fontSizeBase < 34) {
      AppState.fontSizeBase += 2;
      document.documentElement.style.setProperty('--font-base', `${AppState.fontSizeBase}px`);
    }
  });

  elements.btnFontDec.addEventListener('click', () => {
    if (AppState.fontSizeBase > 20) {
      AppState.fontSizeBase -= 2;
      document.documentElement.style.setProperty('--font-base', `${AppState.fontSizeBase}px`);
    }
  });
}

function setupEmergencyFlow() {
  elements.btnEmergencia.addEventListener('click', () => {
    setRobotState('alerta');
    elements.modalEmergency.style.display = 'flex';
    AppState.countdownVal = 15;
    elements.emergencyTimerNum.innerText = AppState.countdownVal;

    clearInterval(AppState.countdownInterval);
    AppState.countdownInterval = setInterval(() => {
      AppState.countdownVal--;
      elements.emergencyTimerNum.innerText = AppState.countdownVal;

      if (AppState.countdownVal <= 0) {
        clearInterval(AppState.countdownInterval);
        confirmEmergencyAction("Tiempo de verificación vencido.");
      }
    }, 1000);
  });

  elements.btnCancelAlert.addEventListener('click', () => {
    clearInterval(AppState.countdownInterval);
    elements.modalEmergency.style.display = 'none';
    setRobotState('disponible');
    speak('Me alegra mucho que estés bien.');
  });

  elements.btnConfirmAlert.addEventListener('click', () => {
    clearInterval(AppState.countdownInterval);
    confirmEmergencyAction("Confirmado por el usuario.");
  });
}

function confirmEmergencyAction(motivo) {
  elements.modalEmergency.innerHTML = `
    <div class="modal-card" style="border-color: var(--alert-red); text-align: center;">
      <h2 style="color: var(--alert-red); font-size: 1.8rem; margin-bottom: 12px;">Alerta Registrada</h2>
      <p style="font-size: 1.2rem; color: #334155; margin-bottom: 16px;">Motivo: ${motivo}</p>
      <a href="tel:911" class="btn-action-main btn-emergencia" style="margin-top: 16px; text-decoration: none;">📞 Llamar al 911</a>
      <button class="btn-pill-small" onclick="location.reload()" style="margin-top: 16px;">Volver a Inicio</button>
    </div>
  `;
}

function setupAgenda() {
  const saved = localStorage.getItem('tagme_reminders');
  if (saved) {
    try { AppState.reminders = JSON.parse(saved); } catch (e) { AppState.reminders = []; }
  }
  renderAgenda();

  elements.btnOpenAgenda.addEventListener('click', () => elements.modalAgenda.style.display = 'flex');
  elements.btnCloseAgenda.addEventListener('click', () => elements.modalAgenda.style.display = 'none');

  document.getElementById('btn-rem-add')?.addEventListener('click', () => {
    const text = document.getElementById('rem-text').value.trim();
    const time = document.getElementById('rem-time-val').value;
    if (!text || !time) return;

    AppState.reminders.push({ text, time, done: false });
    localStorage.setItem('tagme_reminders', JSON.stringify(AppState.reminders));
    document.getElementById('rem-text').value = '';
    document.getElementById('rem-time-val').value = '';
    renderAgenda();
  });
}

function renderAgenda() {
  elements.agendaList.innerHTML = '';
  if (AppState.reminders.length === 0) {
    elements.agendaList.innerHTML = '<p style="color:#64748b; font-size:1.05rem;">Todavía no tenés actividades programadas.</p>';
    return;
  }
  AppState.reminders.forEach((r, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:12px 16px; border-radius:14px; border:2px solid #cbd5e1;';
    item.innerHTML = `
      <div><strong>${r.text}</strong><div style="font-size:0.95rem; color:#0284c7; font-weight:700;">⏰ ${r.time} hs</div></div>
      <button class="btn-pill-small" onclick="deleteReminder(${idx})" style="color:var(--alert-red); border-color:#fca5a5;">Borrar</button>
    `;
    elements.agendaList.appendChild(item);
  });
}

window.deleteReminder = function(idx) {
  AppState.reminders.splice(idx, 1);
  localStorage.setItem('tagme_reminders', JSON.stringify(AppState.reminders));
  renderAgenda();
};

document.addEventListener('DOMContentLoaded', () => {
  checkBackendHealth();
  setupVoiceInput();
  setupFontControls();
  setupEmergencyFlow();
  setupAgenda();

  elements.btnRepetir.addEventListener('click', () => speak(AppState.lastSpokenText));
  elements.btnCloseChat.addEventListener('click', () => elements.modalChat.style.display = 'none');
  elements.btnChatSend.addEventListener('click', () => {
    const val = elements.chatInputText.value;
    elements.chatInputText.value = '';
    sendToGemini(val);
  });
  elements.chatInputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = elements.chatInputText.value;
      elements.chatInputText.value = '';
      sendToGemini(val);
    }
  });

  document.getElementById('btn-open-devices')?.addEventListener('click', () => {
    alert("Módulo ASUME: Pulsera inteligente y sensores ambientales pendientes de vinculación BLE física.");
  });
});