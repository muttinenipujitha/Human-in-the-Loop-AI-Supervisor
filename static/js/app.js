
const api = (path, opts) => fetch(path, opts).then(r => r.json());


function showLog(msg){
  const d = document.getElementById("log");
  const el = document.createElement("div");
  el.className = "muted";
  el.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  d.prepend(el);
  while(d.childElementCount > 200) d.removeChild(d.lastChild);
}

function showToast(message, type = "info", duration = 3500){
  let bg = "#333";
  if(type === "success") bg = "#16a34a";
  if(type === "error") bg = "#dc2626";
  if(type === "info") bg = "#0ea5e9";
  if(typeof Toastify !== "undefined"){
    Toastify({
      text: message,
      duration: duration,
      gravity: "top",
      position: "right",
      style: {
        background: bg,
        color: "#fff",
        borderRadius: "8px",
        boxShadow: "0 6px 18px rgba(2,6,23,0.12)"
      }
    }).showToast();
  } else {
    const fb = document.createElement("div");
    fb.textContent = message;
    fb.style.position = "fixed";
    fb.style.right = "18px";
    fb.style.top = "18px";
    fb.style.background = bg;
    fb.style.color = "#fff";
    fb.style.padding = "8px 12px";
    fb.style.borderRadius = "8px";
    fb.style.zIndex = 9999;
    document.body.appendChild(fb);
    setTimeout(()=> fb.remove(), duration);
  }
}


const MESSAGE_STORE = {}; 

function addMessage(caller_id, from, text){
  if(!caller_id) return;
  if(!MESSAGE_STORE[caller_id]) MESSAGE_STORE[caller_id] = [];
  MESSAGE_STORE[caller_id].unshift({when: new Date().toISOString(), from: from, text: text});
  const currentViewer = document.getElementById("timelineCaller") ? document.getElementById("timelineCaller").value.trim() : "";
  if(currentViewer === caller_id) renderTimeline();
}


function renderTimeline(){
  const caller = document.getElementById("timelineCaller").value.trim();
  const container = document.getElementById("messageTimeline");
  container.innerHTML = "";
  if(!caller){
    container.innerHTML = "<div class='muted small'>Enter a caller id and click View to see messages.</div>";
    return;
  }
  const msgs = MESSAGE_STORE[caller] || [];
  if(msgs.length === 0){
    container.innerHTML = "<div class='muted small'>No messages for this caller yet.</div>";
    return;
  }

  msgs.slice(0,200).forEach(m => {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-msg";

    
    let bubbleClass = "other";
    let label = (m.from || "").toString();
    const lower = label.toLowerCase();
    if (lower.includes("supervisor")) bubbleClass = "supervisor";
    else if (lower.includes("agent")) bubbleClass = "agent";
    else if (lower.includes("caller") || lower.includes("user")) bubbleClass = "caller";

    wrapper.innerHTML = `
      <div class="chat-bubble ${bubbleClass}">
        <div>${escapeHtml(m.text)}</div>
        <div class="chat-meta">${escapeHtml(m.from)} • ${new Date(m.when).toLocaleTimeString()}</div>
      </div>
    `;
    container.appendChild(wrapper);
  });

  container.scrollTop = container.scrollHeight;
}

function clearTimeline(){
  const caller = document.getElementById("timelineCaller").value.trim();
  if(!caller){ showToast("Enter caller id to clear", "info"); return; }
  if(!MESSAGE_STORE[caller] || MESSAGE_STORE[caller].length === 0){ showToast("No messages to clear for " + caller, "info"); return; }
  if(!confirm("Clear message timeline for " + caller + "?")) return;
  MESSAGE_STORE[caller] = [];
  renderTimeline();
  showToast("Cleared timeline for " + caller, "success");
}



async function simulateCall(){
  const caller_id = document.getElementById("caller_id").value.trim();
  const caller_name = document.getElementById("caller_name").value.trim();
  const question = document.getElementById("question").value.trim();
  const timeoutVal = document.getElementById("timeout").value.trim();
  if(!caller_id || !question){ alert("Caller ID and question required"); return; }
  const payload = {caller_id, caller_name, question};
  if(timeoutVal) payload.request_timeout_minutes = parseFloat(timeoutVal);

  
  addMessage(caller_id, "Caller", question);

  try{
    const res = await api('/calls', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    document.getElementById("callResponse").textContent = JSON.stringify(res);

    if(res.status === 'answered'){
      const msg = `[Agent -> Caller ${caller_id}] ${res.answer}`;
      showLog(msg);
      addMessage(caller_id, "Agent", res.answer);
      showToast(res.answer, "success", 4500);
      document.getElementById("callResponse").textContent = `Sent to ${caller_id}: ${res.answer}`;
    } else if(res.status === 'escalated'){
      const msg = `[Agent] Escalated request ${res.request_id} from ${caller_id}. Caller told: "Let me check with my supervisor and get back to you."`;
      showLog(msg);
      addMessage(caller_id, "Agent", "Let me check with my supervisor and get back to you. (request_id=" + res.request_id + ")");
      showToast("Escalated to supervisor — caller will be contacted", "info", 4000);
      document.getElementById("callResponse").textContent = `Escalated (request ${res.request_id}). Caller was told supervisor will follow up.`;
    } else {
      showLog("[Sim] Unknown / unexpected response: " + JSON.stringify(res));
      showToast("Unexpected response from server", "error", 3500);
    }
  }catch(e){ 
    showLog("[Err] simulateCall " + e.toString());
    showToast("Failed to send call: " + e.toString(), "error", 4500);
  }
  await refreshAll();
}



async function refreshPending(){
  try {
    const list = await api('/help-requests?status=pending');
    const container = document.getElementById("pendingList"); container.innerHTML = "";
    if(list.length===0){ container.innerHTML = "<div class='muted small'>No pending requests</div>"; return; }
    list.forEach(r => {
      const el = document.createElement("div"); el.className = "item";
      const qPreview = r.question.length > 120 ? r.question.substring(0,120) + "…" : r.question;
      el.innerHTML = `<div>
          <div><strong>#${r.id}</strong> ${escapeHtml(r.caller_name||r.caller_id)}</div>
          <div class="meta">${escapeHtml(qPreview)}</div>
          <div class="meta">Created: ${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button onclick="viewDetail(${r.id})" class="small-btn">View</button>
          <button onclick="markUnresolved(${r.id})" class="small-btn ghost">Mark Unresolved</button>
        </div>`;
      container.appendChild(el);
    });
  } catch(e){
    showLog("[Err] refreshPending " + e.toString());
  }
}

async function refreshHistory(){
  try {
    const list = await api('/help-requests');
    const container = document.getElementById("historyList");
    container.innerHTML = "";
    list.slice(0,30).forEach(r => {
      const el = document.createElement("div"); el.className = "muted";
      el.innerHTML = `<b>#${r.id}</b> [${r.status}] ${escapeHtml(r.question)} — ${new Date(r.created_at).toLocaleString()}`;
      container.appendChild(el);
    });
  } catch(e){
    showLog("[Err] refreshHistory " + e.toString());
  }
}



let currentDetail = null;
async function viewDetail(id){
  try{
    const r = await api(`/help-requests/${id}`);
    currentDetail = r;
    const d = document.getElementById("detail");
    d.innerHTML = `
      <div><b>Request #${r.id}</b> — <span class="muted">${r.status}</span></div>
      <div class="muted">Caller: ${escapeHtml(r.caller_name||r.caller_id)}</div>
      <div style="margin-top:8px"><div><strong>Question</strong></div><div class="muted">${escapeHtml(r.question)}</div></div>
      <div style="margin-top:10px"><textarea id="superAnswer" placeholder="Type supervisor's answer here"></textarea></div>
      <div style="margin-top:8px"><input id="supervisorName" placeholder="Supervisor name" value="Supervisor A" /></div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button onclick="resolve(${r.id})">Resolve & Save to KB</button>
        <button onclick="resolve(${r.id}, true)" class="ghost">Resolve w/o KB</button>
        <button onclick="closeDetail()" class="ghost">Close</button>
      </div>
      ${r.supervisor_answer ? `<div style="margin-top:10px"><strong>Supervisor answer:</strong><div class="muted">${escapeHtml(r.supervisor_answer)}</div></div>` : ""}
    `;
  } catch(e){
    showLog("[Err] viewDetail " + e.toString());
    showToast("Failed to fetch request details", "error");
  }
}

function closeDetail(){ document.getElementById("detail").innerHTML = "Select pending request..."; currentDetail = null; }

async function resolve(id, noKb=false){
  const answerEl = document.getElementById("superAnswer");
  const supervisorEl = document.getElementById("supervisorName");
  const answer = answerEl ? answerEl.value.trim() : "";
  const supervisor = supervisorEl ? supervisorEl.value.trim() || "Supervisor" : "Supervisor";
  if(!answer && !noKb){ alert("Please enter an answer (or use resolve without KB)"); return; }
  try{
    const payload = {supervisor, answer, create_kb: !noKb};
    const res = await api(`/help-requests/${id}/resolve`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    showLog(`[Sim] Resolved ${id} -> ${JSON.stringify(res)}`);
    try{
      const req = await api(`/help-requests/${id}`);
      if(req && req.caller_id){
        const msg = `My supervisor (${supervisor}) says: ${answer}`;
        showLog(`[Agent -> Caller ${req.caller_id}] ${msg}`);
        addMessage(req.caller_id, "Agent (supervisor reply)", msg);
        showToast(`Sent to ${req.caller_id}: ${shorten(msg, 80)}`, "success", 4500);
      }
    }catch(e2){
      showLog("[Err] fetching request after resolve: " + e2.toString());
      showToast("Resolved but failed to fetch request details", "info", 3000);
    }
    await refreshAll();
    closeDetail();
  }catch(e){
    showLog("[Err] resolve " + e.toString());
    showToast("Failed to resolve request", "error");
  }
}

async function markUnresolved(id){
  if(!confirm("Mark request as UNRESOLVED?")) return;
  try{
    const res = await api(`/help-requests/${id}/mark-unresolved`, {method:'POST'});
    showLog(`[Sim] mark-unresolved ${id} -> ${JSON.stringify(res)}`);
    showToast(`Request ${id} marked unresolved`, "info", 3000);
    await refreshAll();
  }catch(e){
    showLog("[Err] markUnresolved " + e.toString());
    showToast("Failed to mark unresolved", "error");
  }
}



async function renderKB(){
  try {
    const list = await api('/kb');
    const container = document.getElementById("kbList");
    const q = document.getElementById("kbSearch") ? document.getElementById("kbSearch").value.trim().toLowerCase() : "";
    container.innerHTML = "";
    list.filter(k => {
      if(!q) return true;
      return (k.canonical_question + " " + k.answer).toLowerCase().includes(q);
    }).forEach(k => {
      const el = document.createElement("div"); el.className = "item";
      el.innerHTML = `<div>
          <div><strong>${escapeHtml(k.canonical_question)}</strong></div>
          <div class="muted">${escapeHtml(k.answer)}</div>
          <div class="meta">Added: ${new Date(k.created_at).toLocaleString()}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button onclick="kbUse('${escapeQuotes(k.canonical_question)}', '${escapeQuotes(k.answer)}')" class="small-btn">Use</button>
          <button onclick="kbDelete(${k.id})" class="small-btn ghost">Delete</button>
        </div>`;
      container.appendChild(el);
    });
  } catch(e){
    showLog("[Err] renderKB " + e.toString());
  }
}

async function kbUse(q, a){
  document.getElementById("question").value = q;
  document.getElementById("caller_id").value = "+91-0000000000";
  showLog(`[UI] Prefilled question from KB: ${q}`);
  showToast("Prefilled question from KB", "info", 2000);
}

async function kbDelete(id){
  if(!confirm("Delete KB entry?")) return;
  try{
    await fetch(`/kb/${id}`, {method:'DELETE'});
    showLog("[KB] Deleted " + id);
    showToast("KB entry deleted", "info", 2000);
    renderKB();
  }catch(e){
    showLog("[Err] kbDelete " + e.toString());
    showToast("Failed to delete KB", "error");
  }
}

function openKbCreate(){
  const modal = document.getElementById("modal");
  modal.innerHTML = `<div class="card">
    <h3>Create KB entry</h3>
    <div><input id="kb_q" placeholder="Canonical question (display)" /></div>
    <div style="margin-top:8px"><textarea id="kb_a" placeholder="Answer"></textarea></div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button onclick="kbCreate()">Create</button>
      <button onclick="closeModal()" class="ghost">Cancel</button>
    </div>
  </div>`;
  modal.classList.remove("hidden");
  setTimeout(()=> { const i = document.getElementById("kb_q"); if(i) i.focus(); }, 80);
}

function closeModal(){ document.getElementById("modal").classList.add("hidden"); document.getElementById("modal").innerHTML = ""; }

async function kbCreate(){
  const q = document.getElementById("kb_q").value.trim();
  const a = document.getElementById("kb_a").value.trim();
  if(!q || !a){ alert("Question and answer required"); return; }
  try{
    await api('/kb', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({question:q, answer:a})});
    showLog("[KB] Created entry");
    showToast("KB created", "success", 2000);
    closeModal();
    renderKB();
  }catch(e){
    showLog("[Err] kbCreate " + e.toString());
    showToast("Failed to create KB entry", "error");
  }
}



function escapeHtml(s){ if(!s) return ""; return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function escapeQuotes(s){ if(!s) return ""; return String(s).replaceAll("'", "\\'").replaceAll('"','\\"'); }
function shorten(s, n){ if(!s) return ""; return s.length > n ? s.substring(0,n-1) + "…" : s; }

async function refreshAll(){
  await refreshPending();
  await refreshHistory();
  await renderKB();
}

window.onload = async () => {
  const kbSearch = document.getElementById("kbSearch");
  if(kbSearch) kbSearch.addEventListener('input', () => renderKB());
  await refreshAll();
  showLog("Admin panel ready.");
  showToast("Admin UI ready", "info", 1000);
};
