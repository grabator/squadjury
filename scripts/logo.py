"""Builds the SquadJury logo variants as SVG.

Usage: python3 scripts/logo.py
Writes public/img/logo/variants/v1..v5.svg (mark) and v1..v5-lockup.svg (mark + wordmark).
The wordmark text is converted to paths (Barlow Condensed, OFL) so it looks the same everywhere.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'img' / 'logo' / 'variants'
OUT.mkdir(parents=True, exist_ok=True)
FONT = ROOT / 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-normal.woff2'

PURPLE, NIGHT, GREEN, CYAN, MAGENTA, WHITE = '#37003C', '#1F0022', '#00FF87', '#04F5FF', '#E90052', '#FFFFFF'


def text_path(text, size, x=0, y=0, tracking=0):
    """SVG path data for text set in Barlow Condensed 800, baseline at y."""
    font = TTFont(str(FONT))
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font['head'].unitsPerEm
    scale = size / upm
    pen = SVGPathPen(gs)
    cursor = 0
    for ch in text:
        name = cmap[ord(ch)]
        tp = TransformPen(pen, (scale, 0, 0, -scale, x + cursor, y))
        gs[name].draw(tp)
        cursor += gs[name].width * scale + tracking
    return pen.getCommands(), cursor


def gavel(head=GREEN, band=None, handle=WHITE, scale=1.0):
    """A gavel in its own frame: head centred on (0, 0), handle pointing down."""
    band = band or NIGHT
    s = scale
    return f'''
      <rect x="{-14*s}" y="{30*s}" width="{28*s}" height="{230*s}" rx="{14*s}" fill="{handle}"/>
      <rect x="{-118*s}" y="{-50*s}" width="{236*s}" height="{100*s}" rx="{22*s}" fill="{head}"/>
      <rect x="{-86*s}" y="{-50*s}" width="{18*s}" height="{100*s}" fill="{band}" opacity=".9"/>
      <rect x="{68*s}" y="{-50*s}" width="{18*s}" height="{100*s}" fill="{band}" opacity=".9"/>'''


def tile(inner, bg=PURPLE, extra_defs=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>{extra_defs}</defs>
  <rect width="512" height="512" rx="112" fill="{bg}"/>
  {inner}
</svg>
'''


def v1():
    """Pitch strike: the gavel comes down on the centre spot of a pitch."""
    lines = f'''
  <g fill="none" stroke="{WHITE}" stroke-opacity=".3" stroke-width="11">
    <circle cx="256" cy="318" r="112"/>
    <line x1="0" y1="318" x2="512" y2="318"/>
  </g>
  <circle cx="256" cy="318" r="17" fill="{WHITE}"/>
  <g fill="none" stroke="{CYAN}" stroke-width="13" stroke-linecap="round">
    <path d="M196 352 q-22 -14 -30 -38"/><path d="M316 352 q22 -14 30 -38"/>
    <path d="M222 384 q34 12 68 0"/>
  </g>'''
    # Head almost upright with its lower face right above the spot, handle to the right.
    g = f'<g transform="translate(286 196) rotate(-70)">{gavel(scale=0.8)}</g>'
    return tile(lines + g)


def v2():
    """Verdict seal: a round stamp with the gavel inside, like a court stamp."""
    ring = f'''
  <circle cx="256" cy="256" r="196" fill="none" stroke="{GREEN}" stroke-width="18"/>
  <circle cx="256" cy="256" r="164" fill="none" stroke="{GREEN}" stroke-width="5" stroke-dasharray="2 14" stroke-linecap="round"/>'''
    g = f'<g transform="translate(240 230) rotate(-38)">{gavel(head=GREEN, handle=WHITE, scale=0.72)}</g>'
    base = f'<rect x="168" y="352" width="176" height="30" rx="10" fill="{WHITE}" opacity=".9"/>'
    return tile(ring + g + base)


def v3():
    """Ball gavel: the head of the gavel is a football."""
    ball = f'''
    <circle cx="0" cy="0" r="92" fill="{WHITE}"/>
    <path d="M0 -34 L32 -11 L20 28 L-20 28 L-32 -11 Z" fill="{PURPLE}"/>
    <path d="M0 -92 L0 -70 M58 -72 L44 -52 M88 -10 L64 -8 M58 74 L42 52 M-58 74 L-42 52 M-88 -10 L-64 -8 M-58 -72 L-44 -52" stroke="{PURPLE}" stroke-width="7" stroke-linecap="round"/>
    <path d="M0 -70 L-44 -52 L-64 -8 L-42 52 L0 70 L42 52 L64 -8 L44 -52 Z" fill="none" stroke="{PURPLE}" stroke-width="6" stroke-opacity=".35"/>'''
    handle = f'<rect x="-15" y="80" width="30" height="210" rx="15" fill="{GREEN}"/>'
    g = f'<g transform="translate(220 190) rotate(-35)">{handle}{ball}</g>'
    return tile(g)


def v4():
    """Monogram: S and J cut from Barlow, with the gavel as the bar between them."""
    s, w1 = text_path('S', 330)
    j, w2 = text_path('J', 330)
    total = w1 + w2 + 6
    x0 = (512 - total) / 2
    letters = f'''
  <g transform="translate({x0} 372)"><path d="{s}" fill="{WHITE}"/></g>
  <g transform="translate({x0 + w1 + 6} 372)"><path d="{j}" fill="{GREEN}"/></g>'''
    g = f'<g transform="translate(372 150) rotate(-38)">{gavel(head=CYAN, handle=WHITE, scale=0.42)}</g>'
    return tile(letters + g)


def v5():
    """Crest: a football club style shield with the gavel and three stars for the jury."""
    defs = f'<linearGradient id="cr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{MAGENTA}"/><stop offset="1" stop-color="{PURPLE}"/></linearGradient>'
    shield = f'<path d="M256 58 L420 112 V250 C420 352 352 420 256 458 C160 420 92 352 92 250 V112 Z" fill="url(#cr)" stroke="{WHITE}" stroke-width="12"/>'
    stars = ''.join(
        f'<path transform="translate({x} 150) scale(.9)" d="M0 -18 L5 -6 L18 -6 L8 2 L12 15 L0 7 L-12 15 L-8 2 L-18 -6 L-5 -6 Z" fill="{GREEN}"/>'
        for x in (206, 256, 306)
    )
    g = f'<g transform="translate(246 248) rotate(-38)">{gavel(head=GREEN, handle=WHITE, scale=0.6)}</g>'
    return tile(shield + stars + g, bg=NIGHT, extra_defs=defs)


def lockup(mark_svg, name):
    """Mark on the left, wordmark on the right, on a transparent background."""
    inner = mark_svg.split('\n', 1)[1].rsplit('</svg>', 1)[0]
    word, width = text_path('SquadJury', 150, tracking=2)
    W = 170 + 36 + width + 10
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} 170" width="{W:.0f}" height="170">
  <svg x="0" y="0" width="170" height="170" viewBox="0 0 512 512">{inner}</svg>
  <g transform="translate(206 138)"><path d="{word}" fill="{WHITE}"/></g>
</svg>
'''


VARIANTS = {'v1': v1, 'v2': v2, 'v3': v3, 'v4': v4, 'v5': v5}

# The variant used across the site. Change this one letter to switch logos, then run
# `python3 scripts/logo.py && npm run icons`.
CHOSEN = 'v1'

if __name__ == '__main__':
    for key, fn in VARIANTS.items():
        svg = fn()
        (OUT / f'{key}.svg').write_text(svg)
        (OUT / f'{key}-lockup.svg').write_text(lockup(svg, key))
    chosen = VARIANTS[CHOSEN]()
    (OUT.parent / 'mark.svg').write_text(chosen)
    (OUT.parent / 'logo.svg').write_text(lockup(chosen, CHOSEN))
    print('written', len(VARIANTS) * 2, 'variants; site logo is', CHOSEN)
