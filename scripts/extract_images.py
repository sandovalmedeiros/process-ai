"""Extract all images from both PDFs and save them as PNG files."""
import fitz, os

base = "D:/process-ai-prj/docs"
pdfs = [
    "81848_81848_process-mapping-basics-2025_pt-BR-20260213_1.pdf",
    "GUIA MAPEAMENTO PROCESSOS 2.0.pdf",
]

for pdf_name in pdfs:
    pdf_path = os.path.join(base, pdf_name)
    name_noext = os.path.splitext(pdf_name)[0]
    img_dir = os.path.join(base, f"_images_{name_noext}")
    os.makedirs(img_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    total_images = 0

    for page_num in range(len(doc)):
        page = doc[page_num]
        image_list = page.get_images(full=True)

        for img_idx, img in enumerate(image_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            ext = base_image["ext"]

            # Determine image position on page
            # Find which blocks are images
            blocks = page.get_text("blocks")
            img_blocks = [b for b in blocks if b[6] == 1]  # type 1 = image

            img_path = os.path.join(img_dir, f"page{page_num+1:02d}_img{img_idx+1:02d}.{ext}")
            with open(img_path, "wb") as f:
                f.write(image_bytes)

            size_kb = len(image_bytes) / 1024
            w, h = base_image["width"], base_image["height"]
            print(f"  {pdf_name[:40]}... p{page_num+1:02d} img{img_idx+1:02d}  {w}x{h}  {size_kb:.1f}KB  -> {os.path.basename(img_path)}")
            total_images += 1

    doc.close()
    print(f"  TOTAL: {total_images} imagens em {img_dir}\n")

print("Extracao concluida!")
