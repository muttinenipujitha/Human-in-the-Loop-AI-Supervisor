
from dotenv import load_dotenv
load_dotenv()   

import os, traceback
print("=== ENV VARS ===")
print("LIVEKIT_URL:", repr(os.getenv("LIVEKIT_URL")))
print("LIVEKIT_API_KEY set?:", bool(os.getenv("LIVEKIT_API_KEY")))
print("LIVEKIT_API_SECRET set?:", bool(os.getenv("LIVEKIT_API_SECRET")))

print("\n=== PYTHON / LIVEKIT IMPORT TEST ===")
try:
    from voice_agent import create_token, check_livekit_config
    print("voice_agent.check_livekit_config():", check_livekit_config())
    tok = create_token("demo-user", "frontdesk-demo")
    print("\nTOKEN_OK (first 120 chars):\n", tok[:120] + "...")
except Exception:
    print("\n--- EXCEPTION ---")
    traceback.print_exc()
