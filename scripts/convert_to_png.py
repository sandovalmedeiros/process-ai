"""Convert all extracted PDF images to PNG for reliable vision processing."""
import os
from PIL import Image

dirs = [
    "D:/process-ai-prj/docs/_images_81848_81848_process-mapping-basics-2025_pt-BR-20260213_1",
    "D:/process-ai-prj/docs/_images_GUIA MAPEAMENTO PROCESSOS 2.0",
]

for d in dirs:
    png_dir = d + "_png"
    os.makedirs(png_dir, exist_ok=True)
    count = 0

    for f in sorted(os.listdir(d)):
        if f.endswith(('.jpeg', '.jpg', '.png')):
            src = os.path.join(d, f)
            name = os.path.splitext(f)[0]
            dst = os.path.join(png_dir, name + ".png")

            try:
                img = Image.open(src)
                # Convert RGBA/Cmyk to RGB
                if img.mode in ('RGBA', 'P', 'CMYK'):
                    img = img.convert('RGB')
                img.save(dst, 'PNG')
                count += 1
            except Exception as e:
                print(f"  ERRO {f}: {e}")

    print(f"{os.path.basename(d)}: {count} imagens convertidas -> {png_dir}")

print("\nConversao concluida!")
