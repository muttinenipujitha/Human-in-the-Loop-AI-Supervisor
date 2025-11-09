# main.py
import os
import sqlite3
import threading
import datetime
import time
import uuid
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from gtts import gTTS
from dotenv import load_dotenv
load_dotenv()



try:
    from voice_agent import create_token, check_livekit_config
    LIVEKIT_AVAILABLE = True
except Exception:
    create_token = None
    check_livekit_config = lambda: False
    LIVEKIT_AVAILABLE = False


ROOT = os.path.dirname(__file__)
DB_PATH = os.path.join(ROOT, "data.db")
TIMEOUT_MINUTES = float(os.environ.get("HITL_TIMEOUT_MINUTES", "10"))  
TTS_DIR = os.path.join(ROOT, "static", "tts")
os.makedirs(TTS_DIR, exist_ok=True)

app = FastAPI()
app.mount("/static", StaticFiles(directory=os.path.join(ROOT, "static")), name="static")


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    c = conn.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS help_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      caller_id TEXT,
      caller_name TEXT,
      question TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT CHECK(status IN ('pending','resolved','unresolved')) DEFAULT 'pending',
      resolved_at DATETIME,
      supervisor TEXT,
      supervisor_answer TEXT,
      kb_entry_id INTEGER,
      timeout_deadline DATETIME
    );
    CREATE TABLE IF NOT EXISTS kb (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_variant TEXT,
      canonical_question TEXT,
      answer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_request_id INTEGER
    );
    """)
    c.execute("SELECT COUNT(*) as cnt FROM kb")
    if c.fetchone()["cnt"] == 0:
        seeds = [
            ("hours","What are your hours?","Mon-Fri 9:00am-7:00pm; Sat 9:00am-5:00pm; Sun closed"),
            ("haircolor","Do you do hair color?","Yes — Hair Color starts at ₹1,500. Appointments recommended."),
            ("haircut","How much is a haircut?","Haircut ₹400. Walk-ins welcome if available.")
        ]
        for v, q, a in seeds:
            c.execute("INSERT INTO kb (question_variant, canonical_question, answer) VALUES (?,?,?)",(v,q,a))
    conn.commit()
    conn.close()


class BotManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print("[WS] Bot connected. total:", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print("[WS] Bot disconnected. total:", len(self.active_connections))

    async def broadcast(self, message: dict):
        to_remove = []
        for ws in list(self.active_connections):
            try:
                await ws.send_json(message)
            except Exception as e:
                print("[WS] send error:", e)
                to_remove.append(ws)
        for r in to_remove:
            self.disconnect(r)

bot_manager = BotManager()

def create_tts_mp3(text: str) -> str:
    """
    Create a TTS MP3 file under static/tts and return its public URL path.
    """
    uid = uuid.uuid4().hex[:12]
    filename = f"tts_{uid}.mp3"
    path = os.path.join(TTS_DIR, filename)
   
    tts = gTTS(text=text, lang='en', slow=False)
    tts.save(path)
    print("[TTS] Created:", path)
    return f"/static/tts/{filename}"


STOP_BG = False
def background_worker():
    while not STOP_BG:
        try:
            conn = get_conn()
            c = conn.cursor()
            now = datetime.datetime.utcnow().isoformat()
            c.execute("SELECT id, caller_id FROM help_requests WHERE status='pending' AND timeout_deadline IS NOT NULL AND timeout_deadline <= ?", (now,))
            rows = c.fetchall()
            for r in rows:
                req_id = r["id"]
                c.execute("UPDATE help_requests SET status='unresolved' WHERE id=?", (req_id,))
                conn.commit()
                print(f"[BG] Request {req_id} timed out -> UNRESOLVED. Caller: {r['caller_id']}")
            conn.close()
        except Exception as e:
            print("Background worker error:", e)
        time.sleep(5)

@app.on_event("startup")
def startup():
    init_db()
    t = threading.Thread(target=background_worker, daemon=True)
    t.start()

@app.on_event("shutdown")
def shutdown():
    global STOP_BG
    STOP_BG = True


class CallPayload(BaseModel):
    caller_id: str
    caller_name: Optional[str] = ""
    question: str
    request_timeout_minutes: Optional[float] = None

class ResolvePayload(BaseModel):
    supervisor: str
    answer: str
    create_kb: bool = True
    kb_variant: Optional[str] = None


def variant_for(s: str) -> str:
    s = (s or "").lower()
    keep = []
    for ch in s:
        if ch.isalnum() or ch.isspace():
            keep.append(ch)
    return "".join(keep).strip().replace(" ", "_")[:120]



@app.post("/calls")
def incoming_call(p: CallPayload):
    q = (p.question or "").strip()
    q_lower = q.lower()
    conn = get_conn()
    c = conn.cursor()
    
    v = variant_for(q)
    c.execute("SELECT * FROM kb WHERE question_variant = ? OR lower(canonical_question) LIKE ? LIMIT 1", (v, f"%{q_lower}%"))
    kb = c.fetchone()
    if kb:
        answer = kb["answer"]
        print(f"[Agent] Answered caller {p.caller_id}: {answer}")
        
        try:
            mp3_url = create_tts_mp3(answer)
            import asyncio
            asyncio.create_task(bot_manager.broadcast({"action":"play","url":mp3_url,"text":answer}))
        except Exception as e:
            print("[TTS] error creating/broadcasting answer:", e)
        conn.close()
        return JSONResponse({"status":"answered","answer":answer})
    
    timeout_min = p.request_timeout_minutes if p.request_timeout_minutes is not None else TIMEOUT_MINUTES
    deadline = (datetime.datetime.utcnow() + datetime.timedelta(minutes=timeout_min)).isoformat()
    c.execute("""INSERT INTO help_requests (caller_id, caller_name, question, timeout_deadline) VALUES (?,?,?,?)""",
              (p.caller_id, p.caller_name, p.question, deadline))
    req_id = c.lastrowid
    conn.commit()
    conn.close()
    print(f"[Agent] Escalated request {req_id} from {p.caller_id}: '{p.question}' -> SMS/webhook to supervisor (simulated). Timeout in {timeout_min} minutes.")
    print(f"[Agent] Reply to caller {p.caller_id}: Let me check with my supervisor and get back to you. (request_id={req_id})")
    
    try:
        mp3_url = create_tts_mp3("Let me check with my supervisor and get back to you.")
        import asyncio
        asyncio.create_task(bot_manager.broadcast({"action":"play","url":mp3_url,"text":"Let me check with my supervisor and get back to you."}))
    except Exception as e:
        print("[TTS] error creating/broadcasting escalate message:", e)
    return {"status":"escalated","request_id":req_id}

@app.get("/help-requests")
def list_requests(status: Optional[str] = None, limit: int = 200):
    conn = get_conn()
    c = conn.cursor()
    if status in ("pending","resolved","unresolved"):
        c.execute("SELECT * FROM help_requests WHERE status = ? ORDER BY created_at DESC LIMIT ?", (status, limit))
    else:
        c.execute("SELECT * FROM help_requests ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows

@app.get("/help-requests/{req_id}")
def get_request(req_id: int):
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM help_requests WHERE id = ?", (req_id,))
    r = c.fetchone()
    conn.close()
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    return dict(r)

@app.post("/help-requests/{req_id}/resolve")
def resolve_request(req_id: int, p: ResolvePayload):
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM help_requests WHERE id = ?", (req_id,))
    r = c.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="request not found")
    if r["status"] != "pending":
        raise HTTPException(status_code=400, detail="request not pending")
    kb_id = None
    if p.create_kb:
        variant = p.kb_variant or variant_for(r["question"])
        c.execute("INSERT INTO kb (question_variant, canonical_question, answer, source_request_id) VALUES (?,?,?,?)",
                  (variant, r["question"], p.answer, req_id))
        kb_id = c.lastrowid
    now = datetime.datetime.utcnow().isoformat()
    c.execute("UPDATE help_requests SET status='resolved', resolved_at=?, supervisor=?, supervisor_answer=?, kb_entry_id=? WHERE id=?",
              (now, p.supervisor, p.answer, kb_id, req_id))
    conn.commit()
    conn.close()
    
    try:
        mp3_url = create_tts_mp3(p.answer)
        import asyncio
        asyncio.create_task(bot_manager.broadcast({"action":"play","url":mp3_url,"text":p.answer}))
    except Exception as e:
        print("[TTS] error creating/broadcasting supervisor reply:", e)
    print(f"[Agent] Notifying caller {r['caller_id']}: My supervisor ({p.supervisor}) says: {p.answer} (request_id={req_id})")
    return {"status":"ok","request_id":req_id,"kb_id":kb_id}

@app.get("/_debug_livekit")
def debug_livekit():
    import os
    from importlib import util
    has_livekit = util.find_spec("livekit") is not None
    return {
        "LIVEKIT_URL": bool(os.getenv("LIVEKIT_URL")),
        "LIVEKIT_API_KEY": bool(os.getenv("LIVEKIT_API_KEY")),
        "LIVEKIT_API_SECRET": bool(os.getenv("LIVEKIT_API_SECRET")),
        "livekit_installed": has_livekit
    }


@app.post("/help-requests/{req_id}/mark-unresolved")
def mark_unresolved(req_id:int):
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM help_requests WHERE id = ?", (req_id,))
    r = c.fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="not found")
    if r["status"] == "unresolved":
        return {"status":"already_unresolved"}
    c.execute("UPDATE help_requests SET status='unresolved' WHERE id=?", (req_id,))
    conn.commit()
    conn.close()
    print(f"[Agent] Request {req_id} manually marked UNRESOLVED.")
    return {"status":"ok"}

@app.get("/kb")
def get_kb():
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM kb ORDER BY created_at DESC LIMIT 1000")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows

class KBCreate(BaseModel):
    question: str
    answer: str
    variant: Optional[str] = None

@app.post("/kb")
def create_kb(k: KBCreate):
    conn = get_conn()
    c = conn.cursor()
    variant = k.variant or variant_for(k.question)
    c.execute("INSERT INTO kb (question_variant, canonical_question, answer) VALUES (?,?,?)", (variant, k.question, k.answer))
    conn.commit()
    kid = c.lastrowid
    conn.close()
    print(f"[KB] Created KB entry {kid} for variant {variant}")
    return {"id": kid}

@app.delete("/kb/{kid}")
def delete_kb(kid: int):
    conn = get_conn()
    c = conn.cursor()
    c.execute("DELETE FROM kb WHERE id = ?", (kid,))
    conn.commit()
    conn.close()
    print(f"[KB] Deleted KB entry {kid}")
    return {"status":"ok"}


@app.get("/livekit/token")
def livekit_token(identity: str = Query(...), room: str = Query(...)):
    try:
        if not check_livekit_config():
            return JSONResponse({"error":"LiveKit SDK or env not configured. Install livekit-server-sdk and set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET."}, status_code=500)
        token = create_token(identity=identity, room=room)
        return {"token": token}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.websocket("/ws/bot")
async def ws_bot_endpoint(ws: WebSocket):
    await bot_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            
            await ws.send_text("ok")
    except WebSocketDisconnect:
        bot_manager.disconnect(ws)
    except Exception as e:
        print("[WS] error:", e)
        bot_manager.disconnect(ws)


@app.get("/")
def ui():
    return FileResponse(os.path.join("static", "index.html"))

