"""Power-loss-aware atomic file replacement shared by recovery receipts."""

from __future__ import annotations

import ctypes
import os
from pathlib import Path
import time


def _windows_extended_path(path: Path) -> str:
    resolved = str(path.resolve())
    if resolved.startswith("\\\\"):
        return "\\\\?\\UNC\\" + resolved.removeprefix("\\\\")
    return "\\\\?\\" + resolved


def windows_write_through_replace(source: Path, destination: Path) -> None:
    """Replace one Windows file while requesting write-through persistence."""

    move_file_ex = ctypes.WinDLL("kernel32", use_last_error=True).MoveFileExW
    move_file_ex.argtypes = (ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32)
    move_file_ex.restype = ctypes.c_int
    movefile_replace_existing = 0x1
    movefile_write_through = 0x8
    if not move_file_ex(
        _windows_extended_path(source),
        _windows_extended_path(destination),
        movefile_replace_existing | movefile_write_through,
    ):
        raise ctypes.WinError(ctypes.get_last_error())


def durable_replace(source: Path, destination: Path) -> None:
    """Atomically replace one file and persist the resulting directory entry."""

    if os.name == "nt":
        for attempt in range(5):
            try:
                windows_write_through_replace(source, destination)
                break
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.01 * (attempt + 1))
        return
    os.replace(source, destination)
    descriptor = os.open(destination.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _flush_windows_directory(directory: Path) -> None:
    """Flush one Windows directory handle so metadata changes reach storage."""

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    create_file = kernel32.CreateFileW
    create_file.argtypes = (
        ctypes.c_wchar_p,
        ctypes.c_uint32,
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_uint32,
        ctypes.c_void_p,
    )
    create_file.restype = ctypes.c_void_p
    flush_file_buffers = kernel32.FlushFileBuffers
    flush_file_buffers.argtypes = (ctypes.c_void_p,)
    flush_file_buffers.restype = ctypes.c_int
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = (ctypes.c_void_p,)
    close_handle.restype = ctypes.c_int

    generic_write = 0x40000000
    share_read_write_delete = 0x7
    open_existing = 0x3
    file_flag_backup_semantics = 0x02000000
    invalid_handle_value = ctypes.c_void_p(-1).value
    handle = create_file(
        _windows_extended_path(directory),
        generic_write,
        share_read_write_delete,
        None,
        open_existing,
        file_flag_backup_semantics,
        None,
    )
    if handle == invalid_handle_value:
        raise ctypes.WinError(ctypes.get_last_error())
    operation_error: BaseException | None = None
    try:
        if not flush_file_buffers(handle):
            raise ctypes.WinError(ctypes.get_last_error())
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        if not close_handle(handle):
            cleanup_error = ctypes.WinError(ctypes.get_last_error())
            if operation_error is None:
                raise cleanup_error
            operation_error.add_note(
                f"Windows directory handle cleanup failed: {cleanup_error}"
            )


def _flush_directory(directory: Path) -> None:
    if os.name == "nt":
        _flush_windows_directory(directory)
        return
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def durable_unlink(path: Path, *, missing_ok: bool = False) -> None:
    """Delete one file and durably order its directory entry update."""

    try:
        path.unlink()
    except FileNotFoundError:
        if not missing_ok:
            raise
    _flush_directory(path.parent)


__all__ = [
    "durable_replace",
    "durable_unlink",
    "windows_write_through_replace",
]
