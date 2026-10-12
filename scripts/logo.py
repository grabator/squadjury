"""Builds the SquadJury logo: the word "squadjury" where the dot of the j is a yellow card.

Usage: python3 scripts/logo.py   (then `node scripts/icons.mjs`, or just `npm run logo`)
Writes public/img/logo/logo.svg (dark ink), logo-white.svg (for dark backgrounds),
mark.svg (the card on its own), icon.svg (card on a dark tile, for app icons) and public/favicon.svg.
Text is converted to paths (Archivo, OFL) so the logo looks the same everywhere.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'img' / 'logo'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ROOT / 'public' / 'fonts' / 'archivo-latin-var.woff2'

INK, WHITE, CARD, TILE = '#111418', '#F2F3F1', '#FFD400', '#111418'

font = instantiateVariableFont(TTFont(str(FONT)), {'wght': 800, 'wdth': 95})
glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
UPM = font['head'].unitsPerEm


def contours(ch):
    pen = DecomposingRecordingPen(glyphs)
    glyphs[cmap[ord(ch)]].draw(pen)
    out, cur = [], []
    for op, args in pen.value:
        cur.append((op, args))
        if op in ('closePath', 'endPath'):
            out.append(cur)
            cur = []
    return out


def bounds(contour):
    pen = BoundsPen(None)
    for op, args in contour:
        getattr(pen, op)(*args)
    return pen.bounds


def wordmark(text='squadjury', size=100, tracking=-0.035):
    """Path data for the word with the dot of the j left out; returns (d, width, dot box)."""
    s = size / UPM
    pen = SVGPathPen(None)
    x, dot = 0.0, None
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        tp = TransformPen(pen, (s, 0, 0, -s, x, 0))
        if ch == 'j':
            cs = contours('j')
            bs = [bounds(c) for c in cs]
            k = max(range(len(cs)), key=lambda n: bs[n][1])  # the dot sits highest
            b = bs[k]
            dot = (x + b[0] * s, -b[3] * s, (b[2] - b[0]) * s, (b[3] - b[1]) * s)
            for n, c in enumerate(cs):
                if n != k:
                    for op, args in c:
                        getattr(tp, op)(*args)
        else:
            glyphs[name].draw(tp)
        x += hmtx[name][0] * s + (tracking * size if i < len(text) - 1 else 0)
    return pen.getCommands(), x, dot


def card(cx, cy, w, h, rot=8):
    return (f'<rect x="{cx - w / 2:.1f}" y="{cy - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'rx="{w * 0.16:.1f}" fill="{CARD}" transform="rotate({rot} {cx:.1f} {cy:.1f})"/>')


def lockup(ink):
    d, w, (dx, dy, dw, dh) = wordmark()
    cw = dw * 1.35
    yellow = card(dx + dw / 2 + 2, dy + dh / 2 - 6, cw, cw * 4 / 3)
    W = w + 8
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -100 {W:.0f} 128" width="{W:.0f}" height="128">'
            f'<path d="{d}" fill="{ink}"/>{yellow}</svg>\n')


def mark():
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">{card(256, 256, 300, 400)}</svg>\n'


def icon():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
            f'<rect width="512" height="512" fill="{TILE}"/>{card(256, 256, 236, 314)}</svg>\n')


if __name__ == '__main__':
    (OUT / 'logo.svg').write_text(lockup(INK))
    (OUT / 'logo-white.svg').write_text(lockup(WHITE))
    (OUT / 'mark.svg').write_text(mark())
    (OUT / 'icon.svg').write_text(icon())
    (ROOT / 'public' / 'favicon.svg').write_text(mark())
    print('logo written')
