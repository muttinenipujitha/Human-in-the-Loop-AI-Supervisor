

const logEl = document.getElementById("log");
function log(msg){
  const d = document.createElement("div"); d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; logEl.prepend(d);
}

let room = null;

async function getToken(identity, roomName){
  const resp = await fetch(`/livekit/token?identity=${encodeURIComponent(identity)}&room=${encodeURIComponent(roomName)}`);
  if(!resp.ok) {
    const text = await resp.text();
    throw new Error("Token request failed: " + text);
  }
  const data = await resp.json();
  return data.token;
}

document.getElementById("joinBtn").onclick = async ()=>{
  const roomName = document.getElementById("roomName").value.trim();
  const identity = document.getElementById("identity").value.trim();
  if(!roomName || !identity){ alert("enter room & identity"); return; }
  try{
    log("Requesting token...");
    const token = await getToken(identity, roomName);
    log("Joining LiveKit room...");
    const LiveKit = window.livekit;
    room = await LiveKit.connect(token, {});
    log("Joined room as " + identity);
    
    const localTrack = await LiveKit.createLocalAudioTrack();
    await room.localParticipant.publishTrack(localTrack);
    log("Mic published to room. Others in the room can hear you.");
    document.getElementById("joinBtn").disabled = true;
    document.getElementById("leaveBtn").disabled = false;
  }catch(e){
    log("Join error: " + e.toString());
    alert("Join error: " + e.toString());
  }
};

document.getElementById("leaveBtn").onclick = async ()=>{
  if(room){
    room.disconnect();
    room = null;
    log("Left room");
    document.getElementById("joinBtn").disabled = false;
    document.getElementById("leaveBtn").disabled = true;
  }
};


let recognition = null;
document.getElementById("startStt").onclick = ()=>{
  if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)){
    alert("SpeechRecognition not supported in this browser. Use Chrome.");
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (ev) => {
    const text = ev.results[0][0].transcript;
    log("STT recognized: " + text);
    document.getElementById("manualQ").value = text;
    askQuestion(text);
  };
  recognition.onerror = (e) => { log("STT error: " + e.error); };
  recognition.onend = () => { log("STT ended"); document.getElementById("startStt").disabled = false; document.getElementById("stopStt").disabled = true; };
  recognition.start();
  log("STT started - speak now");
  document.getElementById("startStt").disabled = true;
  document.getElementById("stopStt").disabled = false;
};

document.getElementById("stopStt").onclick = ()=>{
  if(recognition) recognition.stop();
  recognition = null;
  document.getElementById("startStt").disabled = false;
  document.getElementById("stopStt").disabled = true;
  log("STT stopped");
};

document.getElementById("askBtn").onclick = ()=>{
  const q = document.getElementById("manualQ").value.trim();
  if(!q) return alert("Enter a question or use STT");
  askQuestion(q);
};

async function askQuestion(questionText){
  try{
    log("Sending question to server: " + questionText);
    const payload = { caller_id: "+91-0000000000", caller_name: "LiveUser", question: questionText };
    const r = await fetch('/calls', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    const j = await r.json();
    if(j.status === 'answered'){
      log("Server answered: " + j.answer);
      speakText(j.answer);
    } else if(j.status === 'escalated'){
      log("Server escalated (help request created id=" + j.request_id + ")");
      speakText("Let me check with my supervisor and get back to you.");
    } else {
      log("Unexpected server response: " + JSON.stringify(j));
    }
  }catch(e){
    log("askQuestion error: " + e.toString());
  }
}

function speakText(text){
  if(!("speechSynthesis" in window)){ log("No speechSynthesis available"); return; }
  const ut = new SpeechSynthesisUtterance(text);
  ut.lang = 'en-IN';
  ut.rate = 1;
  ut.onstart = ()=> log("Speaking...");
  ut.onend = ()=> log("Finished speaking");
  window.speechSynthesis.cancel(); 
  window.speechSynthesis.speak(ut);
}

