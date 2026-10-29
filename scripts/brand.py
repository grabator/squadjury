"""SquadJury znak i natpis: pravi SVG fajlove u public/img/brand (natpis je pretvoren u oblike, pa ne treba font).
Znak: slovo S od dvije strelice transfera (gornja zelena: igrač dolazi, donja crvena: igrač odlazi) i kvačica kao J.
Pokretanje: python3 scripts/brand.py, pa node scripts/brand-png.mjs za PNG ikone."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'img' / 'brand'
FONT = TTFont(ROOT / 'public' / 'fonts' / 'barlow-condensed-800.woff2')
GREEN, RED = '#00e676', '#ff3355'

DEFS = ('<linearGradient id="sjc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#00ff87"/><stop offset="1" stop-color="#05f0ff"/></linearGradient>'
        '<linearGradient id="sjp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b1480"/><stop offset="1" stop-color="#2a0538"/></linearGradient>')
# S i kvačica u koordinatama 0..100
GLYPHS = (
    '<g transform="translate(1 0)" fill="none" stroke-linecap="round" stroke-linejoin="round">'
    f'<path d="M33 50A13 13 0 0 1 33 24H44" stroke="{GREEN}" stroke-width="8"/>'
    f'<path d="M33 50A13 13 0 0 1 33 76H25" stroke="{RED}" stroke-width="8"/>'
    f'<path d="M41 16.5L49 24L41 31.5" stroke="{GREEN}" stroke-width="6.4"/>'
    f'<path d="M28 68.5L20 76L28 83.5" stroke="{RED}" stroke-width="6.4"/>'
    '<path d="M60 60L68 74L84 24" stroke="url(#sjc)" stroke-width="8.5"/></g>'
)
TILE = '<rect x="4" y="4" width="92" height="92" rx="24" fill="url(#sjp)"/>'


def text_path(text, x, baseline, cap_px):
    """Natpis kao jedna putanja: visina velikih slova cap_px, počinje na x."""
    cmap, gs = FONT.getBestCmap(), FONT.getGlyphSet()
    upm, cap = FONT['head'].unitsPerEm, FONT['OS/2'].sCapHeight
    k = cap_px / cap
    pen = SVGPathPen(gs)
    cx = 0
    for ch in text:
        g = gs[cmap[ord(ch)]]
        g.draw(TransformPen(pen, (k, 0, 0, -k, x + cx * k, baseline)))
        cx += g.width
    return pen.getCommands(), cx * k


def logo(ink, file):
    # znak 100x100, natpis visine velikih slova 50, desno od znaka uz razmak 18
    squad, w1 = text_path('SQUAD', 118, 75, 50)
    jury, w2 = text_path('JURY', 118 + w1 + 1, 75, 50)
    w = round(118 + w1 + 1 + w2 + 4)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} 100" width="{w * 2}" height="200"><title>SquadJury</title><defs>{DEFS}</defs>'
           f'{TILE}{GLYPHS}<path d="{squad}" fill="{ink}"/><path d="{jury}" fill="{GREEN}"/></svg>')
    (OUT / file).write_text(svg)
    return svg


OUT.mkdir(parents=True, exist_ok=True)
mark = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512"><title>SquadJury</title><defs>{DEFS}</defs>{TILE}{GLYPHS}</svg>'
(OUT / 'mark.svg').write_text(mark)
# za ikonu koju telefon izreže (maskable): znak manji, podloga preko cijele površine
maskable = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512"><defs>{DEFS}</defs>'
            f'<rect width="100" height="100" fill="url(#sjp)"/><g transform="translate(15 15) scale(.7)">{GLYPHS}</g></svg>')
(OUT / 'maskable.svg').write_text(maskable)
logo('#ffffff', 'logo-white.svg')
logo('#14061f', 'logo-dark.svg')
(ROOT / 'public' / 'favicon.svg').write_text(mark)
(ROOT / 'public' / 'jury' / 'favicon.svg').write_text(mark)
(ROOT / 'public' / 'jury' / 'img' / 'logo' / 'logo-white.svg').write_text((OUT / 'logo-white.svg').read_text())
(ROOT / 'public' / 'jury' / 'img' / 'logo' / 'logo.svg').write_text((OUT / 'logo-dark.svg').read_text())
(ROOT / 'public' / 'jury' / 'img' / 'logo' / 'mark.svg').write_text(mark)
(ROOT / 'public' / 'jury' / 'img' / 'logo' / 'icon.svg').write_text(mark)
print('brand: SVG fajlovi u public/img/brand, favicon i SquadJury logo')
