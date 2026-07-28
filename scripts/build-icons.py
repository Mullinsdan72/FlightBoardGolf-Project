#!/usr/bin/env python3
"""
Generate every icon the app needs from the two source logos.

Sources (committed, never edited by this script):
  assets/flightboard-icon.png      the square mark
  assets/flightboard-wordmark.png  the horizontal lockup

Run after replacing either source:

    pip install Pillow
    python3 scripts/build-icons.py

Why a script rather than exported files: the platforms want the same artwork at
different sizes, with different backgrounds, and Android crops it. Doing that by
hand once means doing it wrong the second time.

    pip install Pillow && python3 scripts/build-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC_ICON = ROOT / "assets/flightboard-icon.png"
SRC_WORDMARK = ROOT / "assets/flightboard-wordmark.png"
OUT = ROOT / "assets/images"

# The app's own background, so a splash on it is seamless.
APP_BG = (243, 242, 242)


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def cut_background(img: Image.Image, thresh: int = 20) -> Image.Image:
    """
    Make the surrounding white transparent while keeping white *inside* the mark.

    The dots, the flag and the line across the bars are white shapes within the
    artwork. A plain "every white pixel becomes transparent" would punch holes
    straight through them, so this floods in from the edges instead and only
    clears background that is actually connected to the outside.
    """
    rgb = img.copy()
    w, h = rgb.size
    sentinel = (255, 0, 255)
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if rgb.getpixel(corner) != sentinel:
            ImageDraw.floodfill(rgb, corner, sentinel, thresh=thresh)

    out = img.convert("RGBA")
    px_src = rgb.load()
    px_out = out.load()
    for y in range(h):
        for x in range(w):
            if px_src[x, y] == sentinel:
                px_out[x, y] = (255, 255, 255, 0)
    return out


def trim(img: Image.Image, pad: int = 0) -> Image.Image:
    """Crop to the artwork, optionally leaving a margin."""
    box = img.getbbox()
    if not box:
        return img
    left, top, right, bottom = box
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(img.width, right + pad)
    bottom = min(img.height, bottom + pad)
    return img.crop((left, top, right, bottom))


def on_canvas(mark: Image.Image, size: int, scale: float, bg) -> Image.Image:
    """Centre the mark on a square canvas, occupying `scale` of the width."""
    canvas = Image.new("RGBA", (size, size), bg)
    target = int(size * scale)
    w, h = mark.size
    ratio = min(target / w, target / h)
    resized = mark.resize((max(1, int(w * ratio)), max(1, int(h * ratio))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def circle_safe_scale(mark: Image.Image, safe_frac: float = 0.66) -> float:
    """
    The largest `scale` whose *corners* still fall inside Android's safe circle.

    Android crops an adaptive icon to a circle or squircle and only guarantees
    the middle 66%. Sizing by width alone isn't enough — a wide mark's corners
    sit further from the centre than its edges do, and at scale 0.58 this one's
    outer bars were 405px out against a 338px safe radius, so they'd have had
    their corners shaved off on a round-icon launcher.
    """
    w, h = mark.size
    # Half-diagonal of the drawn art, as a fraction of the canvas width.
    diag_frac = ((w**2 + h**2) ** 0.5) / (2 * max(w, h))
    return (safe_frac / 2) / diag_frac


def silhouette(mark: Image.Image) -> Image.Image:
    """
    The red shapes only, in white, with the interior detail left as holes.

    Android's themed icons tint a single-colour shape. Flattening the whole mark
    would lose the dots and the flag; keeping them as holes preserves the design
    at the one size where it has to survive being recoloured.
    """
    out = Image.new("RGBA", mark.size, (255, 255, 255, 0))
    src = mark.load()
    dst = out.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = src[x, y]
            if a > 128 and r > 110 and r - g > 50 and r - b > 50:
                dst[x, y] = (255, 255, 255, 255)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    icon_src = load(SRC_ICON)
    mark = trim(cut_background(icon_src))
    print(f"mark trimmed to {mark.size}")

    # iOS: square, fully opaque, no rounded corners of our own — iOS masks it.
    # A transparent iOS icon is rejected at submission.
    on_canvas(mark, 1024, 0.80, (255, 255, 255, 255)).convert("RGB").save(OUT / "icon.png")

    # Android adaptive: the system crops to a circle or squircle, so the mark
    # has to sit well inside the canvas — sized off its diagonal, not its width.
    adaptive = circle_safe_scale(mark)
    print(f"adaptive scale {adaptive:.3f} (fits the corners inside the mask)")
    on_canvas(mark, 1024, adaptive, (0, 0, 0, 0)).save(OUT / "android-icon-foreground.png")
    Image.new("RGBA", (1024, 1024), (255, 255, 255, 255)).save(OUT / "android-icon-background.png")
    on_canvas(silhouette(mark), 1024, adaptive, (0, 0, 0, 0)).save(OUT / "android-icon-monochrome.png")

    # Splash: transparent, so it sits on the app's own background rather than a
    # white square on an off-white screen.
    splash = mark.copy()
    splash.thumbnail((512, 512), Image.LANCZOS)
    splash.save(OUT / "splash-icon.png")

    favicon = mark.copy()
    favicon.thumbnail((64, 64), Image.LANCZOS)
    Image.alpha_composite(Image.new("RGBA", favicon.size, APP_BG + (255,)), favicon).convert("RGB").save(
        OUT / "favicon.png"
    )

    # The wordmark, for the screens somebody meets before they've used the app.
    wordmark = trim(cut_background(load(SRC_WORDMARK)))
    wordmark.thumbnail((1200, 1200), Image.LANCZOS)
    wordmark.save(OUT / "wordmark.png")
    print(f"wordmark trimmed to {wordmark.size}")

    for name in [
        "icon.png",
        "android-icon-foreground.png",
        "android-icon-background.png",
        "android-icon-monochrome.png",
        "splash-icon.png",
        "favicon.png",
        "wordmark.png",
    ]:
        p = OUT / name
        print(f"  {name:32} {Image.open(p).size} {p.stat().st_size // 1024}kB")


if __name__ == "__main__":
    main()
