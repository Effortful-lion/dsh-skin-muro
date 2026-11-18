#!/usr/bin/env python3
"""Generate the two backdrops that ship with this repository.

They are synthetic: value-noise aurora ribbons over a star field for dark, the
same geometry tonally inverted for light. No Muro catalog artwork is used, so
the repository carries no third-party material -- real Muro wallpapers are
fetched onto the user's own Mac at runtime by the settings page.

    python3 tools/make-default-backdrops.py [--out skin/assets]
"""
import argparse
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2560, 1440


def noise(rng, cells, blur):
    low = rng.random((cells, cells)).astype(np.float32)
    img = Image.fromarray((low * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img, dtype=np.float32) / 255.0


def fbm(rng, octaves):
    total = np.zeros((H, W), np.float32)
    weight, norm = 1.0, 0.0
    for cells, blur in octaves:
        total += noise(rng, cells, blur) * weight
        norm += weight
        weight *= 0.55
    return total / norm


def ribbon(rng, y0, thickness, tilt, strength):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    warp = noise(rng, 16, 80) * 300.0
    band = (yy - (y0 + tilt * (xx - W * 0.5) + warp)) / thickness
    return np.exp(-band * band) * strength * (0.5 + 0.5 * np.sin(xx / 460.0 + noise(rng, 8, 140) * 9.0))


def stars(rng, count, glow_scale):
    core = Image.new("L", (W, H), 0)
    glow = Image.new("L", (W, H), 0)
    draw_core, draw_glow = ImageDraw.Draw(core), ImageDraw.Draw(glow)
    for _ in range(count):
        x, y = rng.integers(4, W - 4), rng.integers(4, H - 4)
        lum = rng.random() ** 2.2
        r = 0.6 + lum * 1.5
        value = int(70 + lum * 185)
        draw_core.ellipse((x - r, y - r, x + r, y + r), fill=value)
        if lum > 0.72:
            draw_glow.ellipse((x - 3, y - 3, x + 3, y + 3), fill=int(value * 0.8))
    glow = glow.filter(ImageFilter.GaussianBlur(glow_scale))
    return np.asarray(core, np.float32) / 255.0, np.asarray(glow, np.float32) / 255.0


def dark(seed):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H
    r = np.sqrt(((xx - W * 0.48) / W) ** 2 + ((yy - H * 0.38) / H) ** 2)

    top, mid, bottom = (np.array(c, np.float32) for c in ([2, 3, 7], [7, 11, 22], [3, 5, 10]))
    img = np.where(v[..., None] < 0.55,
                   top + (mid - top) * (v / 0.55)[..., None],
                   mid + (bottom - mid) * ((v - 0.55) / 0.45)[..., None])
    img += np.array([28, 46, 92], np.float32) * (np.clip(1.0 - r * 1.45, 0, 1) ** 2)[..., None] * 0.42

    clouds = fbm(rng, [(10, 120), (26, 60), (70, 22)])
    img += (clouds ** 2)[..., None] * np.array([104, 140, 220], np.float32) * 0.24
    img += fbm(rng, [(6, 200), (18, 90)])[..., None] * np.array([58, 84, 160], np.float32) * 0.16

    aurora = ribbon(rng, H * 0.66, 230, 0.22, 0.9) + ribbon(rng, H * 0.34, 150, -0.40, 0.55) + ribbon(rng, H * 0.86, 110, 0.12, 0.35)
    img += aurora[..., None] * np.array([169, 196, 255], np.float32) * 0.2
    img += ribbon(rng, H * 0.74, 300, 0.18, 0.7)[..., None] * np.array([120, 210, 230], np.float32) * 0.06

    milky = np.exp(-((xx - yy * 1.75 - 250) / 420.0) ** 2)
    img += (milky * (0.35 + clouds * 0.9))[..., None] * np.array([150, 170, 225], np.float32) * 0.2

    core, glow = stars(rng, 3200, 3.0)
    img += (core * (0.35 + 0.9 * milky))[..., None] * np.array([240, 246, 255], np.float32)
    img += glow[..., None] * np.array([190, 214, 255], np.float32) * 0.65
    img += rng.normal(0, 2.2, (H, W, 3)).astype(np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def light(seed):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = yy / H
    r = np.sqrt(((xx - W * 0.70) / W) ** 2 + ((yy - H * 0.22) / H) ** 2)

    top, bottom = np.array([250, 252, 255], np.float32), np.array([214, 227, 245], np.float32)
    img = top + (bottom - top) * (v[..., None] ** 1.25)
    glow = np.clip(1.0 - r * 1.7, 0, 1) ** 2.2
    img += glow[..., None] * np.array([255, 255, 255], np.float32) * 0.85
    img += (glow ** 0.6)[..., None] * np.array([169, 196, 255], np.float32) * 0.22

    clouds = fbm(rng, [(8, 140), (22, 70), (60, 26)])
    img -= (clouds ** 1.6)[..., None] * (np.array([255, 255, 255], np.float32) - np.array([150, 178, 224], np.float32)) * 0.62

    bands = ribbon(rng, H * 0.62, 250, 0.26, 1.0) * 0.55 + ribbon(rng, H * 0.30, 170, -0.36, 0.45)
    img -= bands[..., None] * (np.array([255, 255, 255], np.float32) - np.array([186, 208, 244], np.float32)) * 0.85
    img -= np.array([120, 150, 205], np.float32) * (np.clip(v - 0.55, 0, 1) ** 1.5)[..., None] * 0.72
    img += rng.normal(0, 1.3, (H, W, 3)).astype(np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="skin/assets")
    args = parser.parse_args()
    target = pathlib.Path(__file__).resolve().parent.parent / args.out
    target.mkdir(parents=True, exist_ok=True)
    for theme, art in (("dark", dark(7)), ("light", light(11))):
        path = target / f"backdrop-{theme}.jpg"
        art.save(path, "JPEG", quality=92, optimize=True, progressive=True)
        print(f"{path} {path.stat().st_size // 1024} KiB")


if __name__ == "__main__":
    main()
