"""Identify recovery-operation owners without signaling their processes."""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import os
from pathlib import Path


UNKNOWN_STARTED_AT_NS = -1


def _windows_process_started_at_ns(process_id: int) -> int | None:
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    open_process = kernel32.OpenProcess
    open_process.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    open_process.restype = wintypes.HANDLE
    get_process_times = kernel32.GetProcessTimes
    get_process_times.argtypes = (
        wintypes.HANDLE,
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
    )
    get_process_times.restype = wintypes.BOOL
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = (wintypes.HANDLE,)
    close_handle.restype = wintypes.BOOL

    handle = open_process(0x1000, False, process_id)
    if not handle:
        error = ctypes.get_last_error()
        return None if error == 87 else UNKNOWN_STARTED_AT_NS
    try:
        creation = wintypes.FILETIME()
        exit_time = wintypes.FILETIME()
        kernel_time = wintypes.FILETIME()
        user_time = wintypes.FILETIME()
        if not get_process_times(
            handle,
            ctypes.byref(creation),
            ctypes.byref(exit_time),
            ctypes.byref(kernel_time),
            ctypes.byref(user_time),
        ):
            return UNKNOWN_STARTED_AT_NS
        exit_ticks_100ns = (exit_time.dwHighDateTime << 32) | exit_time.dwLowDateTime
        if exit_ticks_100ns != 0:
            return None
        ticks_100ns = (creation.dwHighDateTime << 32) | creation.dwLowDateTime
        return ticks_100ns * 100
    finally:
        close_handle(handle)


def _proc_process_started_at_ns(process_id: int) -> int | None:
    stat_path = Path("/proc") / str(process_id) / "stat"
    try:
        raw = stat_path.read_text(encoding="ascii")
        fields = raw[raw.rfind(")") + 2 :].split()
        start_ticks = int(fields[19])
        ticks_per_second = int(os.sysconf("SC_CLK_TCK"))
    except FileNotFoundError:
        return None
    except (OSError, UnicodeError, ValueError, IndexError):
        return UNKNOWN_STARTED_AT_NS
    return start_ticks * 1_000_000_000 // ticks_per_second


def process_started_at_ns(process_id: int) -> int | None:
    """Return a stable creation identity, None when dead, or -1 when unknowable."""

    if process_id <= 0:
        return None
    if os.name == "nt":
        return _windows_process_started_at_ns(process_id)
    if Path("/proc").is_dir():
        return _proc_process_started_at_ns(process_id)
    return UNKNOWN_STARTED_AT_NS


def current_process_owner() -> dict[str, int]:
    process_id = os.getpid()
    started_at_ns = process_started_at_ns(process_id)
    if started_at_ns is None:
        raise OSError("current process identity is unavailable")
    return {"pid": process_id, "started_at_ns": started_at_ns}


def valid_process_owner(owner: object) -> bool:
    return (
        isinstance(owner, dict)
        and isinstance(owner.get("pid"), int)
        and int(owner["pid"]) > 0
        and isinstance(owner.get("started_at_ns"), int)
        and int(owner["started_at_ns"]) >= UNKNOWN_STARTED_AT_NS
    )


def process_owner_is_active(owner: object) -> bool:
    """Treat an inaccessible owner as active and reject reused process IDs."""

    if not valid_process_owner(owner):
        return False
    assert isinstance(owner, dict)
    expected = int(owner["started_at_ns"])
    observed = process_started_at_ns(int(owner["pid"]))
    if observed == UNKNOWN_STARTED_AT_NS or expected == UNKNOWN_STARTED_AT_NS:
        return True
    return observed is not None and observed == expected


__all__ = [
    "UNKNOWN_STARTED_AT_NS",
    "current_process_owner",
    "process_owner_is_active",
    "process_started_at_ns",
    "valid_process_owner",
]
