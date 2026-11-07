"""Confere as margens de um PDF em A4 medindo o que foi realmente impresso (não o que o HTML pediu).

Uso:  python scripts/verificar-margens-pdf.py docs/Guia-do-Usuario-Agilis.pdf [esq dir topo base]
Padrão das margens, em mm: 25 (esquerda), 20 (direita), 20 (topo) e 22 (base), as do Guia do Usuário.
Requer PyMuPDF (pip install pymupdf) e Pillow. Sai com código 1 se alguma página invadir as margens.
"""
import sys
import pymupdf
from PIL import Image

caminho = sys.argv[1]
esq, dir_, topo, base = (float(x) for x in sys.argv[2:6]) if len(sys.argv) >= 6 else (25.0, 20.0, 20.0, 22.0)
TOLERANCIA = 1.0  # mm: sombras e suavização de borda
DPI = 100
k = DPI / 25.4

doc = pymupdf.open(caminho)
largura_mm, altura_mm = doc[0].rect.width / 72 * 25.4, doc[0].rect.height / 72 * 25.4
print(f"{doc.page_count} páginas, {largura_mm:.1f} x {altura_mm:.1f} mm (A4 = 210 x 297)")
if abs(largura_mm - 210) > 1 or abs(altura_mm - 297) > 1:
    print("AVISO: a página não é A4.")


def caixa(img):
    return img.convert("L").point(lambda v: 255 if v < 245 else 0).getbbox()


menores = [999.0, 999.0, 999.0, 999.0]
problemas = []
for numero, pagina in enumerate(doc, start=1):
    pm = pagina.get_pixmap(dpi=DPI)
    img = Image.frombytes("RGB", (pm.width, pm.height), pm.samples)
    c = caixa(img)
    if not c:
        continue
    d_esq, d_dir, d_topo = c[0] / k, (pm.width - c[2]) / k, c[1] / k
    corpo = caixa(img.crop((0, 0, pm.width, int((altura_mm - base) * k))))  # acima da margem inferior (o rodapé fica nela)
    d_base = (pm.height - corpo[3]) / k if corpo else 999.0
    menores = [min(menores[0], d_esq), min(menores[1], d_dir), min(menores[2], d_topo), min(menores[3], d_base)]
    if d_esq < esq - TOLERANCIA or d_dir < dir_ - TOLERANCIA or d_topo < topo - TOLERANCIA or d_base < base - TOLERANCIA:
        problemas.append((numero, round(d_esq, 1), round(d_dir, 1), round(d_topo, 1), round(d_base, 1)))

print(f"Menores distâncias às bordas (mm): esquerda {menores[0]:.1f}, direita {menores[1]:.1f}, topo {menores[2]:.1f}, base do conteúdo {menores[3]:.1f}")
if problemas:
    print("Páginas com conteúdo dentro das margens (página, esq, dir, topo, base):")
    for p in problemas:
        print("  ", p)
    sys.exit(1)
print("OK: nada impresso dentro das margens.")
