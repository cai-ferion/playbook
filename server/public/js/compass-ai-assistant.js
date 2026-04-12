/**
 * Compass AI Assistant — Chat interface for CAP advisory and policy guidance.
 * Calls /api/io/compass/ai/chat endpoint.
 */
/* global currentUser, showToast */

const AI_API = '/api/io/compass/ai';
let aiState = { messages: [], isLoading: false };

function initCompassAiAssistant() {
  var container = document.getElementById('compass-ai-content');
  if (!container) return;

  container.innerHTML = '<div style="display:flex;flex-direction:column;height:calc(100vh - 120px);max-height:800px;padding:16px;">' +
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent, #6366f1);display:flex;align-items:center;justify-content:center;">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 14 22h-4a7 7 0 0 1-6.73-3H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>' +
      '</div>' +
      '<div>' +
        '<h3 style="margin:0;font-size:15px;color:var(--fg);">Compass AI Assistant</h3>' +
        '<p style="margin:0;font-size:12px;color:var(--fg-muted);">CAP advisory based on GPHR Policy v3.0 and employee history</p>' +
      '</div>' +
    '</div>' +
    '<div id="ai-chat-messages" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:8px;"></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<input type="text" id="ai-chat-input" placeholder="Ask about CAP levels, policy guidance, or employee history..." style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-input, var(--bg));color:var(--fg);font-size:14px;" onkeydown="if(event.key===\'Enter\')aiSendMessage()">' +
      '<button class="btn btn-primary" onclick="aiSendMessage()" id="ai-send-btn" style="padding:10px 20px;">Send</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-outline btn-sm" onclick="aiQuickPrompt(\'What CAP level is appropriate for a first-time attendance violation?\')">Attendance CAP</button>' +
      '<button class="btn btn-outline btn-sm" onclick="aiQuickPrompt(\'Explain the progressive discipline policy for quality errors.\')">Quality Errors</button>' +
      '<button class="btn btn-outline btn-sm" onclick="aiQuickPrompt(\'What are the ZTP infractions and their consequences?\')">ZTP Policy</button>' +
      '<button class="btn btn-outline btn-sm" onclick="aiQuickPrompt(\'How long is the active period for each CAP level?\')">Active Periods</button>' +
    '</div>' +
  '</div>';

  // Show welcome message
  var messagesEl = document.getElementById('ai-chat-messages');
  if (messagesEl && !aiState.messages.length) {
    messagesEl.innerHTML = aiRenderMessage('assistant', 'Hello! I\'m the Compass AI Assistant. I can help you with:\n\n' +
      '\u2022 **CAP level recommendations** based on employee history and violation type\n' +
      '\u2022 **Policy guidance** from GPHR Policy v3.0\n' +
      '\u2022 **Progressive discipline** escalation paths\n' +
      '\u2022 **Attendance violation** thresholds and consequences\n' +
      '\u2022 **ZTP infractions** and their handling\n\n' +
      'Ask me anything about the corrective action process!');
  }
}

function aiRenderMessage(role, content) {
  var isUser = role === 'user';
  var bgColor = isUser ? 'var(--accent, #6366f1)' : 'var(--bg-card, #1e1e2e)';
  var textColor = isUser ? 'white' : 'var(--fg)';
  var align = isUser ? 'flex-end' : 'flex-start';
  var maxW = '80%';

  // Simple markdown rendering
  var rendered = content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
    .replace(/\u2022/g, '&bull;');

  return '<div style="display:flex;justify-content:' + align + ';">' +
    '<div style="max-width:' + maxW + ';padding:12px 16px;border-radius:12px;background:' + bgColor + ';color:' + textColor + ';font-size:14px;line-height:1.6;border:1px solid var(--border);">' +
      rendered +
    '</div>' +
  '</div>';
}

function aiQuickPrompt(text) {
  var input = document.getElementById('ai-chat-input');
  if (input) input.value = text;
  aiSendMessage();
}

async function aiSendMessage() {
  var input = document.getElementById('ai-chat-input');
  var messagesEl = document.getElementById('ai-chat-messages');
  var sendBtn = document.getElementById('ai-send-btn');
  if (!input || !messagesEl) return;

  var text = input.value.trim();
  if (!text || aiState.isLoading) return;

  // Add user message
  aiState.messages.push({ role: 'user', content: text });
  messagesEl.innerHTML += aiRenderMessage('user', text);
  input.value = '';
  aiState.isLoading = true;
  sendBtn.disabled = true;
  sendBtn.textContent = '...';

  // Add loading indicator
  var loadingId = 'ai-loading-' + Date.now();
  messagesEl.innerHTML += '<div id="' + loadingId + '" style="display:flex;justify-content:flex-start;">' +
    '<div style="padding:12px 16px;border-radius:12px;background:var(--bg-card);border:1px solid var(--border);">' +
      '<div class="spinner" style="width:16px;height:16px;"></div>' +
    '</div></div>';
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    var resp = await fetch(AI_API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: aiState.messages,
        user_ohr: currentUser.ohr_id,
        user_role: currentUser.actual_role,
      }),
    });
    if (!resp.ok) throw new Error('AI request failed');
    var result = await resp.json();
    var reply = result.reply || result.message || 'I apologize, I could not generate a response.';

    aiState.messages.push({ role: 'assistant', content: reply });

    // Remove loading, add response
    var loadEl = document.getElementById(loadingId);
    if (loadEl) loadEl.remove();
    messagesEl.innerHTML += aiRenderMessage('assistant', reply);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    var loadEl2 = document.getElementById(loadingId);
    if (loadEl2) loadEl2.remove();
    messagesEl.innerHTML += aiRenderMessage('assistant', 'Error: ' + err.message + '. Please try again.');
  } finally {
    aiState.isLoading = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}
