"""Terminal cell layout and a resizable viewport. No command is rerun on resize."""
from contextlib import contextmanager
import os
import re
import select
import shutil
import sys
import time
import unicodedata

ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
RESET = '\x1b[0m'


def size():
    # Exported COLUMNS/LINES may be stale after resizing an IDE terminal.
    try:
        return os.get_terminal_size(sys.__stdout__.fileno())
    except (OSError, ValueError, AttributeError):
        return shutil.get_terminal_size((80, 24))


def cell_width(character):
    if unicodedata.combining(character) or unicodedata.category(character) in ('Mn', 'Me', 'Cf'):
        return 0
    return 2 if unicodedata.east_asian_width(character) in 'WF' else 1


def width(value):
    return sum(cell_width(character) for character in ANSI.sub('', str(value)))


def pad(value, columns):
    return value + ' '*max(0, columns-width(value))


def wrap(value, columns):
    """Wrap in terminal cells, retaining SGR colors across physical lines."""
    columns = max(1, columns)
    lines, line, used, colors = [], '', 0, ''
    for token in re.findall(r'\x1b\[[0-?]*[ -/]*[@-~]|[^\x1b]', str(value).expandtabs(4)):
        if ANSI.fullmatch(token):
            if token.endswith('m'):
                line += token
                colors = '' if token in ('\x1b[0m', '\x1b[m') else colors+token
            continue
        if token == '\n':
            lines.append(line+(RESET if colors else ''))
            line, used = colors, 0
            continue
        if ord(token) < 32 or 127 <= ord(token) < 160:
            continue
        cells = cell_width(token)
        if used+cells > columns:
            lines.append(line+(RESET if colors else ''))
            line, used = colors, 0
        if cells <= columns:
            line, used = line+token, used+cells
    lines.append(line+(RESET if colors else ''))
    return lines


def clip(value, columns):
    return wrap(value, columns)[0]


def table_lines(headers, rows, columns, tones=None, style=lambda text, tone: text, indent=2, boxed=True):
    rows = [[str(cell) for cell in row] for row in rows]
    count = len(headers)
    if not count:
        return []
    # A narrow window becomes labeled records so no columns disappear.
    overhead = (3*count+1 if boxed else 2*(count-1)) + indent
    if columns-overhead < count*5:
        lines = []
        for index, row in enumerate(rows):
            if index:
                lines.append(' '*indent+'─'*max(1, columns-indent))
            for column, (header, value) in enumerate(zip(headers, row)):
                tone = tones[index][column] if tones else 'cyan'
                lines += [' '*indent+style(part, tone) for part in wrap(header+': '+value, max(1, columns-indent))]
        return lines or [' '*indent+part for part in wrap(' | '.join(headers), max(1, columns-indent))]
    available = columns-overhead
    natural = [max([width(str(header)), *(width(row[index]) for row in rows)]) for index, header in enumerate(headers)]
    widths = [max(5, size) for size in natural]
    while sum(widths) > available:
        index = max(range(count), key=lambda index: widths[index])
        widths[index] -= 1
    # Give spare space to columns proportionally, including empty tables.
    spare = available-sum(widths)
    total = sum(widths)
    additions = [spare*size//total for size in widths]
    widths = [size+addition for size, addition in zip(widths, additions)]
    for index in range(available-sum(widths)):
        widths[index % count] += 1
    lines = []
    prefix = ' '*indent

    def border(left, middle, right):
        return prefix+style(left+middle.join('─'*(size+2) for size in widths)+right, 'muted')

    def emit(row, colors):
        cells = [wrap(value, size) for value, size in zip(row, widths)]
        for physical in range(max(map(len, cells))):
            values = [style(pad(cell[physical] if physical < len(cell) else '', size), tone)
                      for cell, size, tone in zip(cells, widths, colors)]
            separator = style('│', 'muted')
            lines.append(prefix+separator+' '+(' '+separator+' ').join(values)+' '+separator if boxed else prefix+'  '.join(values))

    if boxed:
        lines.append(border('┌', '┬', '┐'))
    emit(list(headers), ['bold']*count)
    lines.append(border('├', '┼', '┤') if boxed else prefix+'  '.join('─'*size for size in widths))
    for index, row in enumerate(rows):
        emit(row, tones[index] if tones else ['cyan']*count)
    if boxed:
        lines.append(border('└', '┴', '┘'))
    return lines


class Viewport:
    def __init__(self, title, stream=None, footer='PgUp/PgDn: rolar | help | clear | exit'):
        self.stream = stream or sys.stdout
        self.title, self.footer = title, footer
        self.blocks = []
        self.offset, self.follow, self.busy = 0, False, False
        self.prompt, self.suffix = '', 0
        self.home = False
        self.size = size()
        self.screen = False
        self.last_partial = False

    def enter(self):
        self.stream.write('\x1b[?1049h\x1b[?25h')
        self.stream.flush()
        self.screen = True

    def leave(self):
        if self.screen:
            self.stream.write('\x1b[?25h\x1b[?1049l')
            self.stream.flush()
            self.screen = False

    def reset(self, factory=None, home=False):
        self.blocks = [factory] if factory else []
        self.offset, self.follow, self.home = 0, False, home
        self.last_partial = False

    def append(self, value):
        if self.last_partial and not value.startswith('\n'):
            value = '\n'+value
        self.last_partial = False
        if self.blocks and isinstance(self.blocks[-1], str):
            self.blocks[-1] += value
        else:
            self.blocks.append(value)

    def add(self, factory):
        self.blocks.append(factory)

    def lines(self):
        columns = max(1, self.size.columns-1)
        lines = []
        for block in self.blocks:
            if isinstance(block, str):
                lines += wrap(block, columns)
            else:
                lines += [part for line in block(columns, max(1, self.size.lines-4)) for part in wrap(line, columns)]
        return lines

    def draw(self):
        self.size = size()
        columns, height = max(1, self.size.columns-1), max(4, self.size.lines)
        body = max(1, height-4)
        lines = self.lines()
        maximum = max(0, len(lines)-body)
        self.offset = maximum if self.follow else max(0, min(self.offset, maximum))
        visible = lines[self.offset:self.offset+body]
        position = f'{self.offset+1}–{min(len(lines), self.offset+body)}/{len(lines)}' if maximum else ''
        heading = clip(self.title, max(1, columns-width(position)-3))
        heading = pad(heading, max(width(heading), columns-width(position)))+position
        output = ['\x1b[?25l\x1b[H\x1b[2K'+clip(heading, columns)]
        for index in range(body):
            output.append(f'\x1b[{index+2};1H\x1b[2K'+clip(visible[index] if index < len(visible) else '', columns))
        output.append(f'\x1b[{height-2};1H\x1b[2K'+'─'*columns)
        output.append(f'\x1b[{height-1};1H\x1b[2K'+clip(self.prompt, columns))
        output.append(f'\x1b[{height};1H\x1b[2K'+clip(self.footer, columns))
        partial = self.busy and self.blocks and isinstance(self.blocks[-1], str) and not self.blocks[-1].endswith('\n')
        if partial and visible:
            output.append(f'\x1b[{len(visible)+1};{min(columns, width(visible[-1]))+1}H')
        else:
            output.append(f'\x1b[{height-1};{min(columns, width(self.prompt)-self.suffix)+1}H')
        output.append('\x1b[?25h')
        self.stream.write(''.join(output))
        self.stream.flush()

    def input(self, prompt, suffix=0):
        self.prompt, self.suffix = prompt, suffix
        self.stream.write(f'\x1b[{max(4, self.size.lines)-1};1H\x1b[2K'+prompt+(f'\x1b[{suffix}D' if suffix else '')+'\x1b[?25h')
        self.stream.flush()

    def scroll(self, direction):
        self.follow = False
        self.offset += direction*max(1, self.size.lines-6)
        self.draw()

    def wait(self, seconds, descriptor):
        """Wait for quit/scroll/resize; repaint the cached sample without recollecting."""
        deadline, pending = time.monotonic()+seconds, b''
        while True:
            remaining = deadline-time.monotonic()
            if remaining <= 0:
                return False
            ready, _, _ = select.select([descriptor], [], [], min(.1, remaining))
            if size() != self.size:
                self.draw()
            if ready:
                data = os.read(descriptor, 1024)
                if not data or any(key in data for key in (b'q', b'Q', b'\x03', b'\x04')):
                    return True
                pending += data
                while pending:
                    if pending.startswith((b'\x1b[5~', b'\x1b[6~')):
                        self.scroll(-1 if pending[2:3] == b'5' else 1)
                        pending = pending[4:]
                    elif b'\x1b[5~'.startswith(pending) or b'\x1b[6~'.startswith(pending):
                        break
                    else:
                        pending = pending[1:]


class ConsoleOutput:
    def __init__(self, viewport, original):
        self.viewport, self.original = viewport, original

    @property
    def encoding(self):
        return self.original.encoding

    def fileno(self):
        return self.original.fileno()

    def isatty(self):
        return self.original.isatty()

    def write(self, value):
        self.viewport.append(value)
        return len(value)

    def flush(self):
        self.viewport.draw()
        self.viewport.last_partial = bool(self.viewport.busy and self.viewport.blocks and isinstance(self.viewport.blocks[-1], str)
                                          and not self.viewport.blocks[-1].endswith('\n'))

    def render_metrics(self, snapshot, history, mode, host_only, service, renderer):
        self.viewport.add(lambda columns, height: renderer(snapshot, history, mode, host_only, service, columns, compact=height < 32))


@contextmanager
def captured(viewport):
    previous_out, previous_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = ConsoleOutput(viewport, previous_out), ConsoleOutput(viewport, previous_err)
    try:
        yield
    finally:
        sys.stdout, sys.stderr = previous_out, previous_err
