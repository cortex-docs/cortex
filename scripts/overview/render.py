#!/usr/bin/env python3
"""Render a lossless, 2x animated PNG from Playwright MCP captures and CLI output.

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
from functools import lru_cache, partial
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
WIDTH, HEIGHT, SCALE = 1200, 736, 2
VIEWPORT = (1200, 700)
PANEL, BORDER = '#0b0c0e', '#303236'
TEXT, MUTED, ACCENT = '#f4f4f5', '#a1a1aa', '#a7f3d0'


@lru_cache(maxsize=None)
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
            return ImageFont.truetype(candidate, size * SCALE)
    raise SystemExit('Set CORTEX_OVERVIEW_FONT and CORTEX_OVERVIEW_MONO_FONT to font files.')


def text(draw, position, value, size=18, color=TEXT, mono=False):
    draw.text(scaled(position), value, fill=color, font=font(size, mono))


def scaled(coordinates):
    return tuple(round(value * SCALE) for value in coordinates)


def frame(location):
    image = Image.new('RGB', scaled((WIDTH, HEIGHT)), PANEL)
    draw = ImageDraw.Draw(image)
    draw.rectangle(scaled((0, 0, WIDTH, 36)), fill='#191b1e')
    draw.line(scaled((0, 35, WIDTH, 35)), fill=BORDER, width=SCALE)
    for x, color in [(20, '#ed6a5e'), (38, '#f4bf4f'), (56, '#61c554')]:
        draw.ellipse(scaled((x, 14, x + 9, 23)), fill=color)
    length = draw.textlength(location, font=font(13, True)) / SCALE
    text(draw, ((WIDTH - length) / 2, 10), location, 13, MUTED, True)
    return image


def terminal(lines, command='', count=0, serve=None, started=False, cursor=True):
    image = frame('petstore — terminal')
    draw = ImageDraw.Draw(image)
    text(draw, (30, 66), '# OpenAPI source configured in cortex.config.yml', 18, MUTED, True)
    text(draw, (30, 104), '$', 21, ACCENT, True)
    text(draw, (56, 104), command, 21, TEXT, True)
    if cursor and count == 0:
        x = 58 + draw.textlength(command, font=font(21, True)) / SCALE
        draw.rectangle(scaled((x, 106, x + 10, 128)), fill=ACCENT)
    for index, line in enumerate(lines[:count]):
        color = ACCENT if line.startswith('✓') else MUTED
        if index == 0:
            color = TEXT
        text(draw, (30, 151 + index * 24), line, 17, color, True)
    if serve is not None:
        text(draw, (30, 615), '$', 21, ACCENT, True)
        text(draw, (56, 615), serve, 21, TEXT, True)
        if cursor:
            x = 58 + draw.textlength(serve, font=font(21, True)) / SCALE
            draw.rectangle(scaled((x, 617, x + 10, 639)), fill=ACCENT)
    if started:
        text(draw, (30, 661), 'Starting docs server at http://localhost:3012', 18, MUTED, True)
    return image


def browser(scene, source):
    image = frame(scene['url'].replace('https://', '').split('?')[0])
    with Image.open(source / f"{scene['name']}.png") as screenshot:
        if screenshot.size != scaled(VIEWPORT):
            raise ValueError(f"{scene['name']}: expected {scaled(VIEWPORT)}, got {screenshot.size}")
        image.paste(screenshot.convert('RGB'), scaled((0, 36)))
    return image


def pointer(image, point, pulse=0):
    image = image.copy()
    draw = ImageDraw.Draw(image)
    x, y = point
    if pulse:
        radius = 10 + pulse * 8
        draw.ellipse(scaled((x-radius, y-radius, x+radius, y+radius)), outline=ACCENT, width=2*SCALE)
    points = [(x, y), (x+1, y+22), (x+7, y+17), (x+12, y+27),
              (x+17, y+24), (x+12, y+15), (x+21, y+14)]
    draw.polygon([scaled(point) for point in points], fill='#ffffff', outline='#111111', width=2*SCALE)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / '.playwright-mcp/overview')
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/cortex-overview.png')
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

    def add(render, duration):
        frames.append(render)
        durations.append(duration)

    command = 'cortex generate'
    add(partial(terminal, lines), 450)
    for index in range(1, len(command) + 1):
        add(partial(terminal, lines, command[:index]), 70)
    add(partial(terminal, lines, command, cursor=False), 350)
    for count in range(1, len(lines) + 1):
        add(partial(terminal, lines, command, count, cursor=False), 130)
    add(partial(terminal, lines, command, len(lines), cursor=False), 1000)
    serve = 'cortex docs serve'
    for index in range(len(serve) + 1):
        add(partial(terminal, lines, command, len(lines), serve[:index]), 60)
    add(partial(terminal, lines, command, len(lines), serve, True, False), 1200)

    position = (1030, 670)
    for scene in scenes:
        base = browser(scene, args.source)
        add(base.copy, scene['duration'])
        if scene['target']:
            target = (scene['target'][0], scene['target'][1] + 36)
            for index in range(1, 13):
                progress = 1 - (1 - index / 12) ** 3
                point = tuple(a + (b - a) * progress for a, b in zip(position, target))
                add(partial(pointer, base, point), 33)
            add(partial(pointer, base, target, 1), 100)
            add(partial(pointer, base, target, 2), 100)
            position = target

    # Pillow inspects this sequence twice, so it must be re-iterable. Render
    # lazily to avoid retaining another copy of the whole 2x animation.
    class RenderedFrames:
        def __iter__(self):
            return (render() for render in frames[1:])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    frames[0]().save(args.output, format='PNG', save_all=True,
                     append_images=RenderedFrames(),
                     duration=durations, loop=0, optimize=True, disposal=0, blend=0)
    poster = browser(scenes[0], args.source)
    poster.save(args.output.with_name(f'{args.output.stem}-poster.png'), optimize=True)

    # A small contact sheet makes every scene easy to review without waiting for a loop.
    previews = [terminal(lines, command, len(lines), serve, True, False)]
    previews += [browser(scene, args.source) for scene in scenes]
    sheet = Image.new('RGB', (600 * 2, 368 * ((len(previews) + 1) // 2)), PANEL)
    for index, preview in enumerate(previews):
        sheet.paste(preview.resize((600, 368), Image.Resampling.LANCZOS),
                    ((index % 2) * 600, (index // 2) * 368))
    sheet.save(args.source / 'contact-sheet.png')
    with Image.open(args.output) as animation:
        assert animation.n_frames > 1 and animation.info['loop'] == 0
        duration, expected_time, expected_index = 0, 0, 0
        for index in range(animation.n_frames):
            animation.seek(index)
            # Pillow can coalesce identical adjacent frames. Compare the decoded
            # image with the source frame at this timestamp to detect any loss.
            while expected_time + durations[expected_index] <= duration:
                expected_time += durations[expected_index]
                expected_index += 1
            assert ImageChops.difference(animation.convert('RGB'), frames[expected_index]()).getbbox() is None
            duration += animation.info['duration']
        assert duration == sum(durations)
        print(f'{args.output}: {animation.n_frames} lossless frames, {duration / 1000:.1f}s, '
              f'{args.output.stat().st_size / 1024 / 1024:.2f} MiB')


if __name__ == '__main__':
    main()
