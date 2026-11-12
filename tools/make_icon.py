"""生成 AURA 应用图标：深色底 + 三条流动光带（与壁纸场景一致）。"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

S = 512
OUT = os.path.join(os.path.dirname(__file__), "..", "host", "assets", "aura.ico")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# 背景：中心略亮的深蓝
bg = Image.new("RGB", (S, S), (3, 6, 12))
px = bg.load()
cx, cy = S * 0.5, S * 0.42
for y in range(S):
    for x in range(S):
        d = math.hypot((x - cx) / S, (y - cy) / S)
        k = max(0.0, 1.0 - d * 1.7)
        px[x, y] = (
            int(3 + 12 * k),
            int(6 + 24 * k),
            int(12 + 44 * k),
        )

# 三条光带
bands = [
    ((0.62, 0.90, 0.98), 0.34, 30, 0.60, 1.15),
    ((0.78, 0.82, 0.90), 0.50, 22, 0.85, 0.80),
    ((0.48, 0.42, 0.78), 0.66, 26, 0.42, 1.35),
]
for (r, g, b), y0, width, alpha, amp in bands:
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = []
    for i in range(0, S + 8, 4):
        t = i / S
        y = S * y0 + math.sin(t * math.pi * 2 * 0.85 + y0 * 6) * S * 0.045 * amp
        y += math.sin(t * math.pi * 2 * 1.7 + 1.3) * S * 0.018 * amp
        pts.append((i, y))
    d.line(pts, fill=(int(r * 255), int(g * 255), int(b * 255), int(alpha * 255)),
           width=width, joint="curve")
    layer = layer.filter(ImageFilter.GaussianBlur(11))
    # 叠一层更细更亮的芯
    core = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dc = ImageDraw.Draw(core)
    dc.line(pts, fill=(int(r * 255), int(g * 255), int(b * 255), int(alpha * 190)), width=max(2, width // 6), joint="curve")
    core = core.filter(ImageFilter.GaussianBlur(3))
    layer = Image.alpha_composite(layer, core)
    bg = Image.alpha_composite(bg.convert("RGBA"), layer).convert("RGB")

img = bg.convert("RGBA")

# 圆角方块遮罩
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
img.putalpha(mask)

# 轻微暗角
vig = Image.new("L", (S, S), 0)
dv = ImageDraw.Draw(vig)
for i in range(60):
    a = int(60 * (i / 60) ** 1.6)
    dv.rounded_rectangle([-i * 2, -i * 2, S + i * 2, S + i * 2], radius=S, outline=(a,))
img = Image.composite(img, Image.new("RGBA", (S, S), (0, 0, 0, 255)), mask)

img.save(OUT, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
img.resize((256, 256), Image.LANCZOS).save(os.path.join(os.path.dirname(OUT), "aura_256.png"))
print("saved", OUT, os.path.getsize(OUT))
