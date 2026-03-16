#!/usr/bin/env python3
"""Generate OG image (1200x630) for WhatsApp/social sharing."""
from PIL import Image, ImageDraw, ImageFont
import math
import os

W, H = 1200, 630
GREEN_DARK = (27, 94, 32)      # #1B5E20
GREEN_MID = (46, 125, 50)      # #2E7D32
GREEN_LIGHT = (56, 142, 60)    # #388E3C
WHITE = (255, 255, 255)
WHITE_ALPHA = (255, 255, 255, 40)

img = Image.new('RGB', (W, H), GREEN_DARK)
draw = ImageDraw.Draw(img)

# Subtle gradient overlay - darker at top, lighter at bottom
for y in range(H):
    ratio = y / H
    r = int(GREEN_DARK[0] + (GREEN_MID[0] - GREEN_DARK[0]) * ratio)
    g = int(GREEN_DARK[1] + (GREEN_MID[1] - GREEN_DARK[1]) * ratio)
    b = int(GREEN_DARK[2] + (GREEN_MID[2] - GREEN_DARK[2]) * ratio)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Draw subtle field lines pattern
overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
odraw = ImageDraw.Draw(overlay)

# Center circle (like a football field)
cx, cy = W // 2, H // 2
odraw.ellipse([cx - 120, cy - 120, cx + 120, cy + 120], outline=(255, 255, 255, 25), width=3)
odraw.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(255, 255, 255, 25))

# Horizontal center line
odraw.line([(0, cy), (W, cy)], fill=(255, 255, 255, 15), width=2)

# Some subtle hexagon pattern in background
def draw_hexagon(draw, cx, cy, r, fill):
    points = []
    for i in range(6):
        angle = math.pi / 3 * i - math.pi / 6
        x = cx + r * math.cos(angle)
        y = cy + r * math.sin(angle)
        points.append((x, y))
    draw.polygon(points, outline=fill, width=2)

for row in range(-1, 8):
    for col in range(-1, 14):
        hx = col * 110 + (55 if row % 2 else 0)
        hy = row * 95
        draw_hexagon(odraw, hx, hy, 50, (255, 255, 255, 12))

img = Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')
draw = ImageDraw.Draw(img)

# ---- Football icon (simplified) ----
ball_cx, ball_cy = W // 2, 210
ball_r = 80

# White ball
draw.ellipse([ball_cx - ball_r, ball_cy - ball_r, ball_cx + ball_r, ball_cy + ball_r], fill=WHITE)

# Dark pentagon in center
pent_r = 30
pent_points = []
for i in range(5):
    angle = math.pi / 2 + 2 * math.pi * i / 5
    px = ball_cx + pent_r * math.cos(angle)
    py = ball_cy - pent_r * math.sin(angle)
    pent_points.append((px, py))
draw.polygon(pent_points, fill=(51, 51, 51))

# Seam lines from pentagon vertices outward
seam_color = (160, 160, 160)
for i in range(5):
    angle = math.pi / 2 + 2 * math.pi * i / 5
    x1 = ball_cx + pent_r * math.cos(angle)
    y1 = ball_cy - pent_r * math.sin(angle)
    x2 = ball_cx + (ball_r - 10) * math.cos(angle)
    y2 = ball_cy - (ball_r - 10) * math.sin(angle)
    draw.line([(x1, y1), (x2, y2)], fill=seam_color, width=3)

# ---- Text ----
# Try to use a nice system font, fallback to default
font_paths = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFCompact.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Helvetica.ttc",
]

def load_font(size, bold=False):
    for fp in font_paths:
        try:
            return ImageFont.truetype(fp, size, index=1 if bold and fp.endswith('.ttc') else 0)
        except (OSError, IndexError):
            continue
    return ImageFont.load_default()

font_title = load_font(90, bold=True)
font_sub = load_font(32)

# "TORQ" title
title = "TORQ"
bbox = draw.textbbox((0, 0), title, font=font_title)
tw = bbox[2] - bbox[0]
draw.text(((W - tw) // 2, 320), title, font=font_title, fill=WHITE)

# Tagline
tagline = "Trenink & Turnaje pro mládežnický fotbal"
bbox2 = draw.textbbox((0, 0), tagline, font=font_sub)
tw2 = bbox2[2] - bbox2[0]
draw.text(((W - tw2) // 2, 430), tagline, font=font_sub, fill=(200, 230, 200))

# Subtle bottom accent line
draw.rectangle([0, H - 6, W, H], fill=(76, 175, 80))  # #4CAF50 accent

# ---- Save ----
out_dir = os.path.join(os.path.dirname(__file__), '..', 'public')
out_path = os.path.join(out_dir, 'og-image.png')
img.save(out_path, 'PNG', optimize=True)

# Also save a smaller version for faster loading
img_small = img.resize((600, 315), Image.LANCZOS)
img_small.save(os.path.join(out_dir, 'og-image-small.png'), 'PNG', optimize=True)

print(f"Generated: {out_path}")
print(f"Size: {os.path.getsize(out_path)} bytes")
