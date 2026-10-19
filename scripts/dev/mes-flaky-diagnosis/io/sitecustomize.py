"""Diagnostic-only Uvicorn boundaries; never record bodies, headers or messages."""

import asyncio
import atexit
import functools
import itertools
import json
import logging
import os
import queue
import threading
import time
from pathlib import Path
from typing import Any


_OUTPUT = os.environ.get("IO_PY_TRACE_FILE")
_RUN = os.environ.get("IO_RUN_ID", "unset")
_EVENTS: queue.SimpleQueue[Any] = queue.SimpleQueue()
_STOP = object()
_IDS = itertools.count(1)
_EVENT_IDS = itertools.count(1)
_TRANSPORTS: dict[int, int] = {}
_FLUSH_SECONDS = 0.25


def _writer() -> None:
    """Batch from memory by time; never flush for every queue-empty event."""
    with open(_OUTPUT, "a", encoding="utf-8", buffering=65536) as stream:
        batch: list[str] = []
        deadline = time.monotonic() + _FLUSH_SECONDS
        while True:
            try:
                value = _EVENTS.get(timeout=max(0.0, deadline - time.monotonic()))
            except queue.Empty:
                value = None
            if value is _STOP:
                stream.writelines(batch)
                stream.flush()
                return
            if value is not None:
                batch.append(json.dumps(value, ensure_ascii=True) + "\n")
            if time.monotonic() >= deadline:
                stream.writelines(batch)
                stream.flush()
                batch.clear()
                deadline = time.monotonic() + _FLUSH_SECONDS


def _event(kind: str, **values: Any) -> None:
    """Timestamp on the producing thread, before buffered disk I/O."""
    _EVENTS.put({"event": kind, "source": "python", "run": _RUN,
                 "pid": os.getpid(), "event_seq": next(_EVENT_IDS),
                 "wall_ns": time.time_ns(), "mono_ns": time.monotonic_ns(), **values})


def _error(exc: BaseException, seen: set[int] | None = None) -> dict[str, Any]:
    """Keep full frame positions/chaining without exception text, locals or source."""
    visited = set() if seen is None else seen
    if id(exc) in visited:
        return {"type": type(exc).__name__, "cycle": True}
    visited.add(id(exc))
    frames: list[dict[str, Any]] = []
    trace = exc.__traceback__
    while trace is not None:
        code = trace.tb_frame.f_code
        frames.append({"file": code.co_filename, "line": trace.tb_lineno, "function": code.co_name})
        trace = trace.tb_next
    result: dict[str, Any] = {"type": type(exc).__name__, "errno": getattr(exc, "errno", None), "frames": frames}
    if exc.__cause__ is not None:
        result["cause"] = _error(exc.__cause__, visited)
    elif exc.__context__ is not None and not exc.__suppress_context__:
        result["context"] = _error(exc.__context__, visited)
    nested = getattr(exc, "exceptions", None)
    if isinstance(nested, (tuple, list)):
        result["exceptions"] = [_error(child, visited) for child in nested if isinstance(child, BaseException)]
    return result


def _address(transport: Any, key: str) -> Any:
    return None if transport is None else transport.get_extra_info(key)


def _cycle_state(cycle: Any) -> dict[str, Any]:
    if cycle is None:
        return {}
    scope = getattr(cycle, "scope", {})
    return {"request": getattr(cycle, "_io_trace_request", None),
            "method": scope.get("method"), "path": scope.get("path"),
            "response_started": getattr(cycle, "response_started", None),
            "response_complete": getattr(cycle, "response_complete", None),
            "disconnected": getattr(cycle, "disconnected", None),
            "keep_alive": getattr(cycle, "keep_alive", None)}


def _protocol_state(protocol: Any) -> dict[str, Any]:
    transport = getattr(protocol, "transport", None)
    handle = getattr(protocol, "timeout_keep_alive_task", None)
    return {"connection": getattr(protocol, "_io_trace_connection", None),
            "protocol": type(protocol).__name__, "local": _address(transport, "sockname"),
            "remote": _address(transport, "peername"),
            "transport_closing": transport.is_closing() if transport else None,
            "keepalive_timer_present": handle is not None,
            "keepalive_timer_cancelled": handle.cancelled() if handle is not None else None,
            "pipeline_length": len(getattr(protocol, "pipeline", ())),
            **_cycle_state(getattr(protocol, "cycle", None))}


def _wrap_protocol(cls: type, method: str) -> None:
    original = getattr(cls, method, None)
    if original is None:
        return

    @functools.wraps(original)
    def observed(self: Any, *args: Any, **kwargs: Any) -> Any:
        if method == "connection_made":
            self._io_trace_connection = next(_IDS)
            _TRANSPORTS[id(args[0])] = self._io_trace_connection
        extra = {"bytes_count": len(args[0])} if method == "data_received" else {}
        if method == "connection_lost":
            extra["error"] = _error(args[0]) if args and args[0] else None
        _event("protocol." + method + ".enter", **_protocol_state(self), **extra)
        try:
            result = original(self, *args, **kwargs)
        except BaseException as exc:
            _event("protocol." + method + ".raise", **_protocol_state(self), error=_error(exc))
            raise
        _event("protocol." + method + ".exit", **_protocol_state(self))
        if method == "connection_lost":
            _TRANSPORTS.pop(id(getattr(self, "transport", None)), None)
        return result

    setattr(cls, method, observed)


def _wrap_cycle(cls: type) -> None:
    original_init, original_run = cls.__init__, cls.run_asgi
    original_send, original_receive = cls.send, cls.receive

    @functools.wraps(original_init)
    def observed_init(self: Any, *args: Any, **kwargs: Any) -> None:
        original_init(self, *args, **kwargs)
        self._io_trace_request = next(_IDS)
        self._io_trace_connection = _TRANSPORTS.get(id(self.transport))
        _event("cycle.init", connection=self._io_trace_connection, **_cycle_state(self))

    @functools.wraps(original_run)
    async def observed_run(self: Any, app: Any) -> Any:
        async def observed_app(scope: Any, receive: Any, send: Any) -> Any:
            _event("app.enter", connection=self._io_trace_connection, **_cycle_state(self))
            try:
                result = await app(scope, receive, send)
            except BaseException as exc:
                _event("app.raise", connection=self._io_trace_connection,
                       **_cycle_state(self), error=_error(exc))
                raise
            _event("app.return", connection=self._io_trace_connection, **_cycle_state(self))
            return result

        try:
            return await original_run(self, observed_app)
        finally:
            _event("cycle.run_asgi.exit", connection=self._io_trace_connection, **_cycle_state(self))

    @functools.wraps(original_send)
    async def observed_send(self: Any, message: dict[str, Any]) -> Any:
        kind = message.get("type")
        terminal = kind == "http.response.body" and not message.get("more_body", False)
        if kind == "http.response.start" or terminal:
            _event("asgi.send.enter", connection=self._io_trace_connection,
                   **_cycle_state(self), message_type=kind, status=message.get("status"),
                   body_bytes=len(message.get("body", b"")), terminal=terminal)
        try:
            result = await original_send(self, message)
        except BaseException as exc:
            _event("asgi.send.raise", connection=self._io_trace_connection,
                   **_cycle_state(self), message_type=kind, error=_error(exc))
            raise
        if terminal:
            _event("asgi.send.complete", connection=self._io_trace_connection, **_cycle_state(self))
        return result

    @functools.wraps(original_receive)
    async def observed_receive(self: Any) -> Any:
        result = await original_receive(self)
        if result.get("type") == "http.disconnect":
            _event("asgi.receive.disconnect", connection=self._io_trace_connection, **_cycle_state(self))
        return result

    cls.__init__, cls.run_asgi = observed_init, observed_run
    cls.send, cls.receive = observed_send, observed_receive


def _install_exception_observer() -> None:
    """A record factory survives Uvicorn dictConfig without changing its handlers."""
    original = logging.getLogRecordFactory()

    def observed(*args: Any, **kwargs: Any) -> logging.LogRecord:
        record = original(*args, **kwargs)
        if record.exc_info and record.exc_info[1] is not None:
            _event("logging.exception", logger=record.name, level=record.levelname,
                   error=_error(record.exc_info[1]))
        return record

    logging.setLogRecordFactory(observed)


def _install_loop_probe() -> None:
    from uvicorn.server import Server
    original = Server.serve

    @functools.wraps(original)
    async def observed(self: Any, *args: Any, **kwargs: Any) -> Any:
        loop = asyncio.get_running_loop()
        period_ns = 100_000_000
        expected_ns = time.monotonic_ns() + period_ns
        last_heartbeat_ns = time.monotonic_ns()
        max_lag_ns = 0
        handle: Any = None

        def tick() -> None:
            nonlocal expected_ns, last_heartbeat_ns, max_lag_ns, handle
            now = time.monotonic_ns()
            lag = max(0, now - expected_ns)
            max_lag_ns = max(max_lag_ns, lag)
            if lag >= 50_000_000:
                _event("loop.lag", expected_mono_ns=expected_ns, observed_mono_ns=now, lag_ms=lag / 1e6)
            if now - last_heartbeat_ns >= 1_000_000_000:
                before = time.monotonic_ns()
                wall = time.time_ns()
                after = time.monotonic_ns()
                _event("process.heartbeat", clock={"mono_before_ns": before, "mono_after_ns": after, "wall_ns": wall},
                       loop={"max_lag_ms": max_lag_ns / 1e6, "implementation": type(loop).__module__ + "." + type(loop).__name__})
                max_lag_ns, last_heartbeat_ns = 0, now
            expected_ns = now + period_ns
            handle = loop.call_later(0.1, tick)

        handle = loop.call_later(0.1, tick)
        _event("server.serve.enter", loop=type(loop).__module__ + "." + type(loop).__name__)
        try:
            return await original(self, *args, **kwargs)
        except BaseException as exc:
            _event("server.serve.raise", error=_error(exc))
            raise
        finally:
            handle.cancel()
            _event("server.serve.exit")

    Server.serve = observed


def _install() -> None:
    import uvicorn
    from uvicorn.protocols.http import h11_impl
    modules = [h11_impl]
    try:
        from uvicorn.protocols.http import httptools_impl
        modules.append(httptools_impl)
    except ImportError:
        pass
    for module in modules:
        cls = module.H11Protocol if module is h11_impl else module.HttpToolsProtocol
        for method in ["connection_made", "connection_lost", "data_received", "eof_received",
                       "on_response_complete", "timeout_keep_alive_handler", "shutdown"]:
            _wrap_protocol(cls, method)
        _wrap_cycle(module.RequestResponseCycle)
    _install_exception_observer()
    _install_loop_probe()
    stat = Path("/proc/self/stat")
    start_ticks = stat.read_text().rsplit(")", 1)[1].split()[19] if stat.exists() else None
    _event("instrumentation.ready", ppid=os.getppid(), start_ticks=start_ticks,
           uvicorn=uvicorn.__version__, protocols=[module.__name__ for module in modules], flush_ms=250)


if _OUTPUT:
    _THREAD = threading.Thread(target=_writer, name="io-observation-writer", daemon=True)
    _THREAD.start()

    def _shutdown() -> None:
        _event("process.exit")
        _EVENTS.put(_STOP)
        _THREAD.join(timeout=2)

    atexit.register(_shutdown)
    try:
        _install()
    except Exception as exc:
        _event("instrumentation.install_error", error=_error(exc))
