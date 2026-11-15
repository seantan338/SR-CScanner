import os
from PIL import Image, ImageDraw

TEAL = (31, 74, 69, 255)
PAPER = (255, 253, 248, 255)
AMBER = (227, 154, 60, 255)
INK = (28, 25, 21, 255)


def icon(size: int, maskable: bool = False) -> Image.Image:
    image = Image.new("RGBA", (size, size), TEAL if maskable else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if not maskable:
        radius = int(size * 0.22)
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=TEAL)
    scale = 0.72 if maskable else 1
    ox = (1 - scale) / 2
    oy = (1 - scale) / 2

    def p(x: float, y: float) -> tuple[int, int]:
        return (int((ox + x * scale) * size), int((oy + y * scale) * size))

    doc = [p(0.27, 0.2), p(0.73, 0.2), p(0.73, 0.82), p(0.27, 0.82)]
    draw.rounded_rectangle([doc[0], doc[2]], radius=int(size * 0.04), fill=PAPER)
    fold = [p(0.58, 0.2), p(0.73, 0.2), p(0.73, 0.36)]
    draw.polygon(fold, fill=AMBER)
    line = int(max(2, size * 0.012))
    for y in (0.48, 0.58, 0.68):
        draw.line([p(0.36, y), p(0.64, y)], fill=INK, width=line)
    draw.arc([p(0.38, 0.28), p(0.62, 0.46)], 200, 340, fill=AMBER, width=max(3, size // 28))
    return image


def save(image: Image.Image, path: str) -> None:
    image.save(path, "PNG")


sizes = {
    "public/icons/icon-192.png": icon(192),
    "public/icons/icon-512.png": icon(512),
    "public/icons/icon-maskable-512.png": icon(512, True),
    "public/icons/apple-touch-icon.png": icon(180),
    "src/app/icon.png": icon(32),
    "src/app/apple-icon.png": icon(180),
}

for path, image in sizes.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    save(image, path)
    print(path)
