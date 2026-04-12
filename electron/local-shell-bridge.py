#!/usr/bin/env python3
import json
import os
import pty
import select
import struct
import sys
import termios
import threading


def set_winsize(fd: int, cols: int, rows: int) -> None:
    packed = struct.pack("HHHH", max(12, rows), max(40, cols), 0, 0)
    fcntl = __import__("fcntl")
    fcntl.ioctl(fd, termios.TIOCSWINSZ, packed)


def main() -> int:
    if len(sys.argv) < 4:
        print("Usage: local-shell-bridge.py <shell> <cols> <rows> [args...]", file=sys.stderr)
        return 1

    shell = sys.argv[1]
    cols = int(sys.argv[2])
    rows = int(sys.argv[3])
    shell_args = sys.argv[4:]

    pid, fd = pty.fork()
    if pid == 0:
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"
        os.execvpe(shell, [shell, *shell_args], env)
        return 1

    set_winsize(fd, cols, rows)

    control_stream = None
    try:
        control_stream = os.fdopen(3, "r", encoding="utf-8", buffering=1)
    except OSError:
        control_stream = None

    def pump_stdin() -> None:
        try:
            while True:
                chunk = os.read(sys.stdin.fileno(), 4096)
                if not chunk:
                    break
                os.write(fd, chunk)
        except OSError:
            pass

    def pump_control() -> None:
        if control_stream is None:
            return
        try:
            for line in control_stream:
                message = json.loads(line)
                if message.get("type") == "resize":
                    set_winsize(
                        fd,
                        int(message.get("cols", cols)),
                        int(message.get("rows", rows)),
                    )
        except Exception:
            pass

    threading.Thread(target=pump_stdin, daemon=True).start()
    threading.Thread(target=pump_control, daemon=True).start()

    try:
        while True:
            readable, _, _ = select.select([fd], [], [], 0.5)
            if fd not in readable:
                continue
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            os.write(sys.stdout.fileno(), data)
    finally:
        try:
            _, status = os.waitpid(pid, 0)
            if os.WIFEXITED(status):
                return os.WEXITSTATUS(status)
        except ChildProcessError:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
