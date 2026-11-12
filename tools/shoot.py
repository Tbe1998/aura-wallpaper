import sys, os, time, subprocess, socket, json
from playwright.sync_api import sync_playwright

OUT = "/opt/data/output/aura-wallpaper/docs/shots"
os.makedirs(OUT, exist_ok=True)
PORT = 8777
if len(sys.argv) > 1:
    PORT = int(sys.argv[1])

scenes = ["nebula", "fluid", "grid"]
themes = {"silver": "D2DCE5", "gold": "CBB68A", "blue": "43A9CF", "violet": "AFA2D9"}

with sync_playwright() as p:
    b = p.chromium.launch(args=[
        "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--hide-scrollbars",
    ])
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
    for s in scenes:
        for t in ["silver", "blue"]:
            url = f"http://127.0.0.1:{PORT}/index.html?scene={s}&accent={t}&fps=60&load=0.45"
            page.goto(url, wait_until="load")
            page.wait_for_timeout(3500)
            info = page.evaluate("window.AURA && window.AURA.state")
            fn = f"{OUT}/{s}_{t}.png"
            page.screenshot(path=fn)
            print(s, t, info, os.path.getsize(fn))
    print("--- console ---")
    print("\n".join(logs[-20:]))
    b.close()
