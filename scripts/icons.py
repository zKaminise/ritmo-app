from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'apps/web/public/icons'
root.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    image = Image.new('RGB', (512, 512), '#b5ee75')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((176, 141, 246, 348), radius=28, fill='#172415')
    draw.rounded_rectangle((202, 140, 328, 210), radius=30, fill='#172415')
    draw.ellipse((315, 310, 355, 350), fill='#172415')
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f'icon-{size}.png')
    if size == 512:
        image.save(root / 'maskable-512.png')
