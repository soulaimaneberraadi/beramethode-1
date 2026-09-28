"""
Icone BERACOUPE : le « B » noir de BERAMETHODE, tel quel, et a la place de la
barre verte un « C » rouge qui suit la meme inclinaison et la meme coupe.

Aucune dependance npm : le trace du B est relu dans electron/build/icon.svg
(meme chemin que l'icone BERAMETHODE), aplati, et rendu avec Pillow en grand
puis reduit (bords propres). Sorties :
  build/icon-coupe.ico, build/icon-coupe-256.png,
  electron/icon-coupe.ico, electron/icon-coupe.png (512),
  electron/build/beracoupe.svg et public/beracoupe-icon.svg (vectoriels).

Lancer : python scripts/make-icon-coupe.py [--apercu chemin.png]
"""
import math
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

RACINE = Path(__file__).resolve().parent.parent
ROUGE = (220, 38, 38)        # #DC2626
NOIR = (0, 0, 0)
M = 2048                      # rendu maitre
VUE = 256                     # repere de travail (celui de l'icone BERAMETHODE en 256 px)

# ------------------------------------------------------------------ B de BERAMETHODE
def lire_chemin(d):
    """Sous-chemins absolus (liste de points) d'un attribut d SVG (M L H V C Z, relatifs ou non)."""
    jetons = re.findall(r'[MmLlHhVvCcZz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    i, cmd, x, y = 0, None, 0.0, 0.0
    sous, courant, depart = [], [], (0.0, 0.0)
    def nb():
        nonlocal i
        v = float(jetons[i]); i += 1; return v
    while i < len(jetons):
        t = jetons[i]
        if re.match(r'[A-Za-z]', t):
            cmd = t; i += 1
            if cmd in 'Zz':
                if courant: sous.append(courant)
                courant = []; x, y = depart
                continue
        rel = cmd.islower()
        c = cmd.upper()
        if c == 'M':
            nx, ny = nb(), nb()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            if courant: sous.append(courant)
            courant = [(x, y)]; depart = (x, y)
            cmd = 'l' if rel else 'L'
        elif c == 'L':
            nx, ny = nb(), nb()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            courant.append((x, y))
        elif c == 'H':
            n = nb(); x = x + n if rel else n; courant.append((x, y))
        elif c == 'V':
            n = nb(); y = y + n if rel else n; courant.append((x, y))
        elif c == 'C':
            a = [nb() for _ in range(6)]
            if rel: a = [a[0] + x, a[1] + y, a[2] + x, a[3] + y, a[4] + x, a[5] + y]
            x0, y0 = x, y
            for k in range(1, 17):
                u = k / 16
                bx = (1-u)**3*x0 + 3*(1-u)**2*u*a[0] + 3*(1-u)*u*u*a[2] + u**3*a[4]
                by = (1-u)**3*y0 + 3*(1-u)**2*u*a[1] + 3*(1-u)*u*u*a[3] + u**3*a[5]
                courant.append((bx, by))
            x, y = a[4], a[5]
    if courant: sous.append(courant)
    return sous

def b_de_beramethode():
    svg = (RACINE / 'electron' / 'build' / 'icon.svg').read_text(encoding='utf-8')
    bloc = re.search(r'<path[^>]*id="path52"[^>]*/>', svg, re.S).group(0)
    d = re.search(r'\sd="([^"]*)"', bloc).group(1)
    # Chaine des transformations de icon.svg : T1(T2(T3 p)), repere 500 -> VUE.
    def tr(p):
        x, y = p
        x, y = 1.291906 * x - 512.65149, 1.2938594 * y - 511.86008
        x, y = 0.24 * x, -0.24 * y + 383.04
        x, y = 1.3333333 * x, -1.3333333 * y + 510.72
        return (x * VUE / 500, y * VUE / 500)
    # Seule la partie droite du trace est le B (la gauche etait la barre verte).
    return [[tr(p) for p in s] for s in lire_chemin(d)], (730.34155 * 1.291906 - 512.65149) * 0.24 * 1.3333333 * VUE / 500

# ------------------------------------------------------------------ C rouge
# Le C : dos arrondi, deux bras droits qui filent jusqu'au B, le tout incline
# exactement comme la barre verte de BERAMETHODE ; les deux bras sont tranches
# par une droite parallele a la coupe du B (le meme geste de coupe que le logo
# d'origine). Dessin voulu par Soulaimane : un C « qui tient » le B.
PENTE = 0.379                 # inclinaison de la barre de BERAMETHODE (dx/dy)
HAUT, BAS = 58.0, 205.0
CY, RY = (HAUT + BAS) / 2, (BAS - HAUT) / 2
CX, RX = 80.0, 62.0           # centre du dos arrondi et demi-largeur exterieure
EP_X, EP_Y = 35.0, 31.0       # epaisseur du trait (comme la barre et le B)
ECART = 10.0                  # air entre le C et la coupe du B
COUPE_B = 121.0               # a gauche : l'ancienne barre du trace d'origine, ecartee

def bord_b(y):
    """Bord gauche du B (sa coupe « \\ ») dans le repere VUE."""
    return 125 + (y - 64) * 0.477

def cisaille(x, y):
    return (x + (CY - y) * PENTE, y)

def stade(rx, ry, haut, bas, n=180):
    """Demi-ellipse a gauche + bande droite vers la droite (hors champ), cisaillee."""
    import math
    pts = [(CX + rx * math.cos(math.radians(90 + 180 * i / n)), CY - ry * math.sin(math.radians(90 + 180 * i / n))) for i in range(n + 1)]
    pts += [(VUE * 2, bas), (VUE * 2, haut)]
    return [cisaille(x, y) for x, y in pts]

def exterieur():
    return stade(RX, RY, HAUT, BAS)

def interieur():
    return stade(RX - EP_X, RY - EP_Y, HAUT + EP_Y, BAS - EP_Y)

def zone_gauche():
    return [(0, 0), (bord_b(0) - ECART, 0), (bord_b(VUE) - ECART, VUE), (0, VUE)]

# ------------------------------------------------------------------ rendu
def rendu(taille, fond=True):
    k = M / VUE
    pt = lambda pts: [(x * k, y * k) for x, y in pts]
    img = Image.new('RGBA', (M, M), (0, 0, 0, 0))
    if fond:
        masque_fond = Image.new('L', (M, M), 0)
        ImageDraw.Draw(masque_fond).rounded_rectangle([0, 0, M - 1, M - 1], radius=int(M * 0.22), fill=255)
        img.paste((255, 255, 255, 255), (0, 0), masque_fond)
    # B : pair-impair (ses contre-formes sont des trous), sans la barre d'origine.
    sous, _ = b_de_beramethode()
    masque_b = Image.new('1', (M, M), 0)
    for sp in sous:
        m = Image.new('1', (M, M), 0)
        ImageDraw.Draw(m).polygon(pt(sp), fill=1)
        masque_b = ImageChops.logical_xor(masque_b, m)
    masque_b = masque_b.convert('L')
    garde = Image.new('L', (M, M), 0)
    ImageDraw.Draw(garde).rectangle([COUPE_B * k, 0, M, M], fill=255)
    masque_b = ImageChops.multiply(masque_b, garde)
    img.paste(NOIR + (255,), (0, 0), masque_b)
    # C
    mc = Image.new('L', (M, M), 0)
    d = ImageDraw.Draw(mc)
    d.polygon(pt(exterieur()), fill=255)
    d.polygon(pt(interieur()), fill=0)
    gauche = Image.new('L', (M, M), 0)
    ImageDraw.Draw(gauche).polygon(pt(zone_gauche()), fill=255)
    mc = ImageChops.multiply(mc, gauche)
    img.paste(ROUGE + (255,), (0, 0), mc)
    return img.resize((taille, taille), Image.LANCZOS)

def svg():
    sous, _ = b_de_beramethode()
    chemin_b = ' '.join('M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in sp) + ' Z' for sp in sous)
    poly = lambda pts: ' '.join(f'{x:.2f},{y:.2f}' for x, y in pts)
    forme_c = ('M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in exterieur()) + ' Z '
               + 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in interieur()) + ' Z')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VUE} {VUE}" width="512" height="512">'
            f'<defs><clipPath id="b"><rect x="{COUPE_B}" y="0" width="{VUE}" height="{VUE}"/></clipPath>'
            f'<clipPath id="g"><polygon points="{poly(zone_gauche())}"/></clipPath></defs>'
            f'<rect width="{VUE}" height="{VUE}" rx="{VUE * 0.22:.1f}" fill="#fff"/>'
            f'<path d="{chemin_b}" fill="#000" fill-rule="evenodd" clip-path="url(#b)"/>'
            f'<g clip-path="url(#g)"><path d="{forme_c}" fill="#DC2626" fill-rule="evenodd"/></g></svg>')

if __name__ == '__main__':
    if '--apercu' in sys.argv:
        rendu(512).save(sys.argv[sys.argv.index('--apercu') + 1])
        sys.exit(0)
    i512, i256 = rendu(512), rendu(256)
    (RACINE / 'build').mkdir(exist_ok=True)
    i256.save(RACINE / 'build' / 'icon-coupe-256.png')
    i512.save(RACINE / 'electron' / 'icon-coupe.png')
    tailles = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    i256.save(RACINE / 'build' / 'icon-coupe.ico', sizes=tailles)
    i256.save(RACINE / 'electron' / 'icon-coupe.ico', sizes=tailles)
    s = svg()
    (RACINE / 'electron' / 'build' / 'beracoupe.svg').write_text(s, encoding='utf-8')
    (RACINE / 'public' / 'beracoupe-icon.svg').write_text(s, encoding='utf-8')
    print('icones BERACOUPE ecrites')
