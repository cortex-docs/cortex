#!/usr/bin/env python3
"""Render the README GIF from Playwright MCP screenshots and real CLI output.

Requires Pillow. Run from any directory:
  python3 scripts/overview/render.py

Inputs in .playwright-mcp/overview: scenes.json, scene PNGs, and generate.log.
Capture scenes with capture.mjs through the Playwright MCP tool. generate.log
must be stdout from `cortex generate` in a Petstore project configured with the
OpenAPI fixture and all 11 SDK languages. Absolute project paths are shortened.
The terminal is replayed with edited timing; the UI tour uses the live demo.
"""

import argparse
import json
import os
import re
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT = 1248, 864
VIEWPORT = (1200, 700)
BG, PANEL, BORDER = '#101113', '#0b0c0e', '#303236'
TEXT, MUTED, ACCENT = '#f4f4f5', '#a1a1aa', '#a7f3d0'
STEPS = ['Generate', 'Getting Started', 'API Reference', 'SDKs', 'MCP']


def font(size, mono=False):
    candidates = (
        [os.environ.get('CORTEX_OVERVIEW_MONO_FONT'),
         '/System/Library/Fonts/Menlo.ttc',
         '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']
        if mono else
        [os.environ.get('CORTEX_OVERVIEW_FONT'),
         '/System/Library/Fonts/Supplemental/Arial.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    )
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    raise SystemExit('Set CORTEX_OVERVIEW_FONT and CORTEX_OVERVIEW_MONO_FONT to font files.')


def text(draw, position, value, size=18, color=TEXT, mono=False):
    draw.text(position, value, fill=color, font=font(size, mono))


def frame(label, step, location):
    image = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    text(draw, (26, 22), 'cortex', 28)
    draw.line((125, 23, 125, 54), fill=BORDER, width=1)
    text(draw, (146, 28), label, 24)
    draw.rounded_rectangle((23, 79, 1224, 817), radius=12, fill=PANEL, outline=BORDER)
    draw.rounded_rectangle((24, 80, 1223, 124), radius=12, fill='#191b1e')
    draw.rectangle((24, 106, 1223, 116), fill='#191b1e')
    for x, color in [(44, '#ed6a5e'), (62, '#f4bf4f'), (80, '#61c554')]:
        draw.ellipse((x, 94, x + 9, 103), fill=color)
    length = draw.textlength(location, font=font(13, True))
    text(draw, ((WIDTH - length) / 2, 90), location, 13, MUTED, True)
    x = 26
    for index, name in enumerate(STEPS):
        color = ACCENT if index == step else (TEXT if index < step else MUTED)
        draw.ellipse((x, 839, x + 6, 845), fill=color)
        text(draw, (x + 14, 832), name, 16, color)
        x += 14 + draw.textlength(name, font=font(16)) + 32
    text(draw, (1015, 833), 'demo.cortexdocs.dev', 15, MUTED)
    return image


def terminal(lines, command='', count=0, serve=None, started=False, cursor=True):
    image = frame('From OpenAPI to docs, SDKs, and MCP', 0, 'petstore — terminal')
    draw = ImageDraw.Draw(image)
    text(draw, (54, 146), '# OpenAPI source configured in cortex.config.yml', 18, MUTED, True)
    text(draw, (54, 184), '$', 21, ACCENT, True)
    text(draw, (80, 184), command, 21, TEXT, True)
    if cursor and count == 0:
        x = 82 + draw.textlength(command, font=font(21, True))
        draw.rectangle((x, 186, x + 10, 208), fill=ACCENT)
    for index, line in enumerate(lines[:count]):
        color = ACCENT if line.startswith('✓') else MUTED
        if index == 0:
            color = TEXT
        text(draw, (54, 231 + index * 24), line, 17, color, True)
    if serve is not None:
        text(draw, (54, 695), '$', 21, ACCENT, True)
        text(draw, (80, 695), serve, 21, TEXT, True)
        if cursor:
            x = 82 + draw.textlength(serve, font=font(21, True))
            draw.rectangle((x, 697, x + 10, 719), fill=ACCENT)
    if started:
        text(draw, (54, 741), 'Starting docs server at http://localhost:3012', 18, MUTED, True)
    return image


def browser(scene, source):
    image = frame(scene['label'], scene['step'], scene['url'].replace('https://', '').split('?')[0])
    with Image.open(source / f"{scene['name']}.png") as screenshot:
        if screenshot.size != VIEWPORT:
            raise ValueError(f"{scene['name']}: expected {VIEWPORT}, got {screenshot.size}")
        image.paste(screenshot.convert('RGB'), (24, 116))
    return image


def pointer(image, point, pulse=0):
    image = image.copy()
    draw = ImageDraw.Draw(image)
    x, y = point
    if pulse:
        radius = 10 + pulse * 8
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), outline=ACCENT, width=2)
    points = [(x, y), (x+1, y+22), (x+7, y+17), (x+12, y+27),
              (x+17, y+24), (x+12, y+15), (x+21, y+14)]
    draw.polygon(points, fill='#ffffff', outline='#111111', width=2)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / '.playwright-mcp/overview')
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/cortex-overview.gif')
    args = parser.parse_args()
    scenes = json.loads((args.source / 'scenes.json').read_text())
    log = re.sub(r'\x1b\[[0-9;]*m', '', (args.source / 'generate.log').read_text())
    config = re.search(r'Config: (.+)/cortex.config.yml', log)
    if not config or 'Generation complete!' not in log:
        raise ValueError('generate.log must contain a successful Cortex generation run.')
    log = log.replace(config.group(1), '.')
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    if len(lines) != 18:
        raise ValueError('Expected the OpenAPI generation log with 11 SDKs and an MCP server.')
    frames, durations = [], []

    def add(image, duration):
        frames.append(image)
        durations.append(duration)

    command = 'cortex generate'
    add(terminal(lines), 450)
    for index in range(1, len(command) + 1):
        add(terminal(lines, command[:index]), 70)
    add(terminal(lines, command, cursor=False), 350)
    for count in range(1, len(lines) + 1):
        add(terminal(lines, command, count, cursor=False), 130)
    add(terminal(lines, command, len(lines), cursor=False), 1000)
    serve = 'cortex docs serve'
    for index in range(len(serve) + 1):
        add(terminal(lines, command, len(lines), serve[:index]), 60)
    add(terminal(lines, command, len(lines), serve, True, False), 1200)

    position = (1030, 670)
    for scene in scenes:
        base = browser(scene, args.source)
        add(base, scene['duration'])
        if scene['target']:
            target = (scene['target'][0] + 24, scene['target'][1] + 116)
            for index in range(1, 9):
                progress = 1 - (1 - index / 8) ** 3
                point = tuple(a + (b - a) * progress for a, b in zip(position, target))
                add(pointer(base, point), 50)
            add(pointer(base, target, 1), 100)
            add(pointer(base, target, 2), 100)
            position = target

    # One shared palette keeps text colors stable and makes delta frames small.
    samples = [frames[0], terminal(lines, command, len(lines), serve, True, False)]
    samples += [browser(scene, args.source) for scene in scenes]
    atlas = Image.new('RGB', (312 * len(samples), 216))
    for index, sample in enumerate(samples):
        atlas.paste(sample.resize((312, 216), Image.Resampling.LANCZOS), (312 * index, 0))
    # Reserve accents: tiny syntax tokens otherwise disappear into the dominant
    # dark surfaces when a palette is learned from thumbnail samples alone.
    accents = [BG, PANEL, BORDER, TEXT, MUTED, ACCENT, '#ffffff', '#000000',
               '#ed6a5e', '#f4bf4f', '#61c554', '#3b82f6', '#60a5fa', '#7dd3fc',
               '#22c55e', '#00c950', '#00e676', '#a78bfa', '#c4b5fd', '#f87171',
               '#ff7b72', '#fb923c', '#f97316', '#d2a8ff', '#a5d6ff', '#79c0ff']
    adaptive = atlas.quantize(colors=256-len(accents), method=Image.Quantize.MEDIANCUT)
    colors = [value for color in accents for value in ImageColor.getrgb(color)]
    colors += adaptive.getpalette()[:3*(256-len(accents))]
    palette = Image.new('P', (1, 1))
    palette.putpalette(colors)
    quantized = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in frames]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    quantized[0].save(args.output, save_all=True, append_images=quantized[1:],
                      duration=durations, loop=0, optimize=True, disposal=1)
    poster = browser(scenes[0], args.source)
    poster.save(args.output.with_suffix('.png'), optimize=True)

    # A small contact sheet makes every scene easy to review without waiting for a loop.
    previews = [terminal(lines, command, len(lines), serve, True, False)]
    previews += [browser(scene, args.source) for scene in scenes]
    sheet = Image.new('RGB', (624 * 2, 432 * ((len(previews) + 1) // 2)), BG)
    for index, preview in enumerate(previews):
        sheet.paste(preview.resize((624, 432), Image.Resampling.LANCZOS),
                    ((index % 2) * 624, (index // 2) * 432))
    sheet.save(args.source / 'contact-sheet.png')
    with Image.open(args.output) as gif:
        assert gif.n_frames > 1 and gif.info['loop'] == 0
        duration = sum(gif.seek(i) or gif.info['duration'] for i in range(gif.n_frames))
        print(f'{args.output}: {gif.n_frames} frames, {duration / 1000:.1f}s, '
              f'{args.output.stat().st_size / 1024 / 1024:.2f} MiB')


if __name__ == '__main__':
    main()
