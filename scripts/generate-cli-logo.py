#!/usr/bin/env python3
"""Build terminal frames from whale.svg. Development only: Pillow, librsvg and Cairo.

Run node scripts/sync-brand.mjs --panel-only before this script after changing the SVG.
The installed CLI reads only the generated JSON and needs no imaging libraries.
"""
import ctypes as c
from ctypes.util import find_library
import hashlib
import json
from pathlib import Path
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docker/panel/public/whale.svg'
WIDTH, HEIGHT, SCALE = 52, 44, 4
PALETTE = [None, '#f8fbff', '#e6efff', '#cfdefa', '#b9d0ff', '#7fb2ff', '#22d3ee', '#0a2e8a']


class Rectangle(c.Structure):
    _fields_ = [('x', c.c_double), ('y', c.c_double), ('width', c.c_double), ('height', c.c_double)]


def function(library, name, result, arguments):
    method = getattr(library, name)
    method.restype, method.argtypes = result, arguments
    return method


def main():
    rsvg, cairo, gobject = [c.CDLL(find_library(name)) for name in ('rsvg-2', 'cairo', 'gobject-2.0')]
    new_svg = function(rsvg, 'rsvg_handle_new_from_data', c.c_void_p, [c.c_char_p, c.c_size_t, c.c_void_p])
    render = function(rsvg, 'rsvg_handle_render_document', c.c_int, [c.c_void_p, c.c_void_p, c.POINTER(Rectangle), c.c_void_p])
    new_surface = function(cairo, 'cairo_image_surface_create', c.c_void_p, [c.c_int, c.c_int, c.c_int])
    new_context = function(cairo, 'cairo_create', c.c_void_p, [c.c_void_p])
    png = function(cairo, 'cairo_surface_write_to_png', c.c_int, [c.c_void_p, c.c_char_p])
    release_context = function(cairo, 'cairo_destroy', None, [c.c_void_p])
    release_surface = function(cairo, 'cairo_surface_destroy', None, [c.c_void_p])
    release_svg = function(gobject, 'g_object_unref', None, [c.c_void_p])
    colors = [tuple(bytes.fromhex(color[1:])) for color in PALETTE[1:]]
    source = SOURCE.read_text()
    frames = []
    with tempfile.TemporaryDirectory(prefix='jubart-logo-') as directory:
        for index, angle in enumerate((0, 7, 12, 7, 0, -7, -12, -7)):
            svg = source.replace('class="swim-tail"', f'class="swim-tail" transform="rotate({angle} 146 263)"')
            svg = svg.replace('class="swim-fin"', f'class="swim-fin" transform="rotate({-angle * 1.5} 259 327)"')
            if index == 4:
                svg = svg.replace('<circle cx="356" cy="284" r="13" fill="#0A2E8A"/>',
                                  '<path d="M345 284 Q356 293 367 284" fill="none" stroke="#0A2E8A" stroke-width="7"/>')
                svg = svg.replace('<circle cx="361" cy="279" r="4" fill="#FFFFFF"/>', '')
            data = svg.encode()
            handle = new_svg(data, len(data), None)
            if not handle:
                raise ValueError('Could not parse whale.svg')
            surface = new_surface(0, WIDTH * SCALE, HEIGHT * SCALE)
            context = new_context(surface)
            try:
                viewport = Rectangle(0, 0, WIDTH * SCALE, HEIGHT * SCALE)
                if not render(handle, context, c.byref(viewport), None):
                    raise ValueError('Could not render whale.svg')
                file = Path(directory) / 'frame.png'
                if png(surface, str(file).encode()):
                    raise ValueError('Could not write preview')
                with Image.open(file) as image:
                    pixels = image.convert('RGBA').resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
                    rows = []
                    for y in range(HEIGHT):
                        row = ''
                        for x in range(WIDTH):
                            *rgb, alpha = pixels.getpixel((x, y))
                            token = 0 if alpha < 100 else 1 + min(range(len(colors)), key=lambda i: sum((a - b) ** 2 for a, b in zip(rgb, colors[i])))
                            row += f'{token:02x}'
                        rows.append(row)
                    frames.append(rows)
            finally:
                release_context(context)
                release_surface(surface)
                release_svg(handle)
    result = {'source': str(SOURCE.relative_to(ROOT)), 'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'width': WIDTH, 'height': HEIGHT, 'palette': PALETTE, 'rows': frames[0], 'frames': frames}
    (ROOT / 'scripts/cli-logo.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'Terminal whale generated: {WIDTH} × {HEIGHT}, {len(frames)} frames.')


if __name__ == '__main__':
    main()
