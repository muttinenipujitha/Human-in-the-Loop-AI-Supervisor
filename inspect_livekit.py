
import importlib, sys, traceback

try:
    m = importlib.import_module("livekit")
    print("livekit module:", getattr(m, "__file__", "<builtin>"))
    print("dir(livekit):")
    for name in sorted(dir(m)):
        print("  ", name)
except Exception:
    print("failed to import livekit:")
    traceback.print_exc()

print("\n--- now try livekit.api ---\n")
try:
    ma = importlib.import_module("livekit.api")
    print("livekit.api module:", getattr(ma, "__file__", "<builtin>"))
    print("dir(livekit.api):")
    for name in sorted(dir(ma)):
        print("  ", name)
except Exception:
    print("failed to import livekit.api:")
    traceback.print_exc()
