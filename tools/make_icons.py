"""Erzeugt Logo-SVG und alle PNG-Icons (Web + Android). Aufruf: python3 tools/make_icons.py"""
import os, cairosvg
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def mark(scale=1.0):
    # Bilanz-Ring (Tacho, unten offen) mit korallfarbenem Fortschritt + Flamme (= kcal) in der Mitte
    import math
    t = f'translate(256 256) scale({scale}) translate(-256 -256)'
    r = 170
    def pt(deg):
        a = math.radians(deg)
        return 256 + r*math.cos(a), 256 + r*math.sin(a)
    # Winkel im SVG-System: 135° (unten links) im Uhrzeigersinn bis 405° (unten rechts)
    x0, y0 = pt(135); x1, y1 = pt(405); xm, ym = pt(300)
    track = f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 1 1 {x1:.1f} {y1:.1f}" fill="none" stroke="#f4f1ea" stroke-opacity=".28" stroke-width="30" stroke-linecap="round"/>'
    prog  = f'<path d="M{x0:.1f} {y0:.1f} A{r} {r} 0 0 1 {xm:.1f} {ym:.1f}" fill="none" stroke="#e46f43" stroke-width="30" stroke-linecap="round"/>'
    knob  = f'<circle cx="{xm:.1f}" cy="{ym:.1f}" r="24" fill="#f4f1ea"/>'
    flame = ('<path d="M256 136 C 286 186, 338 214, 338 292 C 338 344, 302 380, 256 380 '
             'C 210 380, 174 344, 174 292 C 174 250, 196 226, 214 204 C 218 236, 230 252, 246 258 '
             'C 240 214, 240 176, 256 136 Z" fill="#f4f1ea"/>'
             '<path d="M256 254 C 270 278, 296 292, 296 326 C 296 350, 278 366, 256 366 '
             'C 234 366, 216 350, 216 326 C 216 304, 232 290, 240 278 C 246 296, 252 300, 258 302 '
             'C 254 286, 250 270, 256 254 Z" fill="#e46f43"/>')
    return f'<g transform="{t}">{track}{prog}{knob}{flame}</g>'

BG = '''<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#17676a"/><stop offset="1" stop-color="#0b3436"/></linearGradient></defs>'''

def svg(content, bg='round'):
    back = {'round': '<rect width="512" height="512" rx="112" fill="url(#g)"/>',
            'full': '<rect width="512" height="512" fill="url(#g)"/>',
            'none': ''}[bg]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{BG}{back}{content}</svg>'

logo = svg(mark(1.0))
web = os.path.join(ROOT, 'web', 'icons')
open(os.path.join(web, 'logo.svg'), 'w').write(logo)
for size in (192, 512):
    cairosvg.svg2png(bytestring=logo.encode(), write_to=os.path.join(web, f'icon-{size}.png'), output_width=size, output_height=size)
cairosvg.svg2png(bytestring=svg(mark(.78), 'full').encode(), write_to=os.path.join(web, 'icon-maskable-512.png'), output_width=512, output_height=512)

# Android
res = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
fg = svg(mark(.62), 'none')   # Vordergrund für adaptive Icons (Sicherheitszone 66/108)
for d, f in dens.items():
    p = os.path.join(res, f'mipmap-{d}'); os.makedirs(p, exist_ok=True)
    cairosvg.svg2png(bytestring=logo.encode(), write_to=os.path.join(p, 'ic_launcher.png'), output_width=int(48*f), output_height=int(48*f))
    cairosvg.svg2png(bytestring=fg.encode(), write_to=os.path.join(p, 'ic_launcher_foreground.png'), output_width=int(108*f), output_height=int(108*f))
print('Icons erzeugt')
