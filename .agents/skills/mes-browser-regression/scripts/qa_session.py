"""Prepare an isolated MES source snapshot; retain evidence after owned shutdown."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import urllib.request
import zipfile

try:
    import psutil
except ImportError:
    raise SystemExit("Install QA dependencies: python -m pip install -r .agents/skills/mes-browser-regression/scripts/requirements.txt")

PROTECTED_PORTS = {3000, 3001, 8010, 8011}
RUNTIME = Path("_attic/runtime/mes-browser-regression")


def run_path(repo: Path, run_id: str) -> Path:
    """Reject escape and reparse ancestors before creating anything."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", run_id):
        raise ValueError("invalid run ID")
    target = repo / RUNTIME / run_id
    for ancestor in [target, *target.parents]:
        if ancestor.exists() and (ancestor.is_symlink() or ancestor.is_junction()):
            raise ValueError("reparse path is not allowed")
        if ancestor == repo:
            break
    if not target.resolve().is_relative_to(repo):
        raise ValueError("run path escapes repository")
    return target


def validate_overlay(repo: Path, relative: str) -> Path:
    """Allow explicit app source files, never databases, secrets or dependencies."""
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts or path.parts[0] not in {"backend", "frontend"}:
        raise ValueError("invalid overlay path")
    if any(part.startswith(".env") or part in {"node_modules", ".next", "__pycache__"} for part in path.parts):
        raise ValueError("secret/generated overlay is forbidden")
    if path.suffix.lower() not in {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".css"}:
        raise ValueError("non-source overlay is forbidden")
    source = repo / path
    if source.is_symlink() or not source.resolve().is_relative_to(repo.resolve()) or not source.is_file():
        raise ValueError("overlay source missing or escapes repository")
    return source


def copy_overlays(repo: Path, snapshot: Path, paths: list[str]) -> dict[str, str]:
    """Copy exactly selected bytes and record their SHA256 identities."""
    result = {}
    for relative in paths:
        source = validate_overlay(repo, relative)
        data = source.read_bytes()
        destination = snapshot / source.relative_to(repo)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        result[source.relative_to(repo).as_posix()] = hashlib.sha256(data).hexdigest()
    return result


def extract_snapshot(data: bytes, workspace: Path) -> None:
    """Validate every archive member before extraction."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for member in archive.infolist():
            relative = Path(member.filename)
            if relative.is_absolute() or ".." in relative.parts or not (workspace / relative).resolve().is_relative_to(workspace.resolve()):
                raise ValueError("archive path escapes workspace")
        archive.extractall(workspace)


def write_session(run: Path, session: dict) -> None:
    """Keep launch receipts available even when readiness fails."""
    (run / "session.json").write_text(json.dumps(session, indent=2, ensure_ascii=False), encoding="utf-8")


def receipt(pid: int) -> dict:
    """Bind ownership to process creation time and observed command."""
    process = psutil.Process(pid)
    return {"pid": pid, "created_at": process.create_time(), "command": process.cmdline()}


def owned_process(record: dict) -> psutil.Process | None:
    """PID reuse must never authorize terminating a foreign process."""
    try:
        process = psutil.Process(record["pid"])
        if abs(process.create_time() - record["created_at"]) > 0.01 or process.cmdline() != record["command"]:
            raise ValueError("ownership mismatch")
        return process
    except psutil.NoSuchProcess:
        return None


def stop_processes(session: dict) -> None:
    """Validate all roots first, then stop only them and their observed descendants."""
    roots = [process for row in session["processes"][:2] if (process := owned_process(row)) is not None]
    workers = [process for row in session["processes"][2:] if (process := owned_worker(row)) is not None]
    children = descendant_receipts(roots)
    processes = [process for row in reversed(children) if (process := owned_worker(row)) is not None] + workers + roots
    for process in processes:
        try:
            process.terminate()
        except psutil.NoSuchProcess:
            pass
    _, alive = psutil.wait_procs(processes, timeout=10)
    for process in alive:
        # Recheck identity before escalation.
        if any(row["pid"] == process.pid and owned_worker(row) is not None for row in session["processes"] + children):
            process.kill()
    psutil.wait_procs(alive, timeout=5)


def owned_worker(record: dict) -> psutil.Process | None:
    """A recycled old worker PID is foreign; skip it while cleaning live roots."""
    try:
        return owned_process(record)
    except ValueError:
        return None


def descendant_receipts(roots: list[psutil.Process]) -> list[dict]:
    """Ignore already-exited descendants without abandoning live owned roots."""
    records = []
    for root in roots:
        try:
            for child in root.children(recursive=True):
                try:
                    records.append(receipt(child.pid))
                except psutil.NoSuchProcess:
                    pass
        except psutil.NoSuchProcess:
            pass
    return records


def remember_descendants(session: dict) -> None:
    """Persist observed workers so later root exit cannot erase their ownership."""
    roots = [process for row in session["processes"][:2] if (process := owned_process(row)) is not None]
    known = {(row["pid"], row["created_at"]) for row in session["processes"]}
    session["processes"].extend(row for row in descendant_receipts(roots) if (row["pid"], row["created_at"]) not in known)
    write_session(Path(session["run_dir"]), session)


def read_json(url: str) -> dict:
    """Read readiness with a bounded connection timeout."""
    with urllib.request.urlopen(url, timeout=3) as response:
        return json.load(response)


def await_ready(session: dict, timeout: int = 180) -> None:
    """Require the frontend proxy to identify the same ready backend boot."""
    deadline = time.monotonic() + timeout
    backend = session["backend_url"]
    frontend = session["frontend_url"]
    while time.monotonic() < deadline:
        remember_descendants(session)
        if any(owned_process(row) is None for row in session["processes"][:2]):
            raise ValueError("QA server exited; inspect run logs")
        try:
            read_json(backend + "/health/ready")
            boot = read_json(backend + "/api/app-session")
            if read_json(frontend + "/api/app-session")["boot_id"] == boot["boot_id"]:
                with urllib.request.urlopen(frontend + "/mes", timeout=15) as response:
                    if response.status == 200:
                        session["backend_boot"] = boot
                        remember_descendants(session)
                        return
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(1)
    raise ValueError("QA readiness timed out; inspect run logs")


def launch(command: list[str], cwd: Path, env: dict[str, str], log: Path) -> dict:
    """Launch hidden on Windows and immediately retain an ownership receipt."""
    with log.open("wb") as output:
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    return receipt(process.pid)


def start(args: argparse.Namespace, repo: Path, run: Path) -> dict:
    """Bootstrap only a new QA DB from committed source plus selected task overlays."""
    ports = [args.backend_port, args.frontend_port]
    if any(port in PROTECTED_PORTS for port in ports):
        raise ValueError("protected port")
    if ports[0] == ports[1] or any(not 1024 <= port <= 65535 for port in ports):
        raise ValueError("invalid ports")
    if run.exists():
        raise ValueError("run already exists")
    for port in ports:
        with socket.socket() as listener:
            if os.name == "nt":
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            try:
                listener.bind(("127.0.0.1", port))
            except OSError as error:
                raise ValueError(f"occupied port: {port}") from error
    overlays = list(args.overlay)
    if args.overlay_file:
        overlays.extend(line.strip() for line in Path(args.overlay_file).read_text(encoding="utf-8-sig").splitlines() if line.strip())
    for path in overlays:
        validate_overlay(repo, path)
    node = Path(args.node) if args.node else Path((repo / "_attic/runtime/frontend-node-path.txt").read_text().strip())
    version = subprocess.check_output([str(node), "--version"], text=True).strip()
    if not version.startswith("v20."):
        raise ValueError("repository Node.js 20 is required")
    dependencies = repo / "frontend/node_modules"
    if not (dependencies / "next/dist/bin/next").is_file():
        raise ValueError("installed frontend dependencies are required")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    archive = subprocess.check_output(["git", "archive", "--format=zip", head, "backend", "frontend"], cwd=repo)
    run.mkdir(parents=True)
    workspace = run / "workspace"
    extract_snapshot(archive, workspace)
    hashes = copy_overlays(repo, workspace, overlays)
    # Stop python-dotenv searching upward into the user's original environment.
    (workspace / ".env").write_text("", encoding="utf-8")
    db = run / "qa.db"
    env = os.environ.copy()
    env.pop("NEXT_PUBLIC_API_URL", None)
    env.update(DATABASE_URL=f"sqlite:///{db.as_posix()}", APP_ENV="development", REQUIRE_POSTGRES="0",
               MES_RUNTIME_ROOT=str(run / "artifacts"), AUDIT_CSV_DIR=str(run / "audit_csv"),
               PYTHONUTF8="1", PYTHONIOENCODING="utf-8", BACKEND_INTERNAL_URL=f"http://127.0.0.1:{ports[0]}",
               NEXT_TELEMETRY_DISABLED="1", PYTHONPATH=str(workspace / "backend"))
    session = {"schema_version": 1, "repo_root": str(repo), "run_dir": str(run), "head": head,
               "overlay_sha256": hashes, "database": str(db), "status": "preparing", "processes": [],
               "backend_url": f"http://127.0.0.1:{ports[0]}", "frontend_url": f"http://{args.frontend_host}:{ports[1]}",
               "created_at_kst": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() + 9 * 3600)) + "+09:00"}
    write_session(run, session)
    try:
        with (run / "bootstrap.log").open("wb") as output:
            subprocess.run([sys.executable, "bootstrap_db.py", "--all"], cwd=workspace / "backend", env=env,
                           stdout=output, stderr=subprocess.STDOUT, check=True, timeout=120)
            subprocess.run([sys.executable, str(Path(__file__).with_name("seed_qa.py")), str(db), str(workspace / "backend")],
                           cwd=workspace / "backend", env=env, stdout=output, stderr=subprocess.STDOUT, check=True, timeout=30)
        junction = workspace / "frontend/node_modules"
        if os.name == "nt":
            subprocess.run(["cmd.exe", "/c", "mklink", "/J", str(junction), str(dependencies)], capture_output=True, check=True)
        else:
            junction.symlink_to(dependencies, target_is_directory=True)
        session["processes"].append(launch([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(ports[0]), "--workers", "1"], workspace / "backend", env, run / "backend.log"))
        write_session(run, session)
        session["processes"].append(launch([str(node), str(junction / "next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", str(ports[1])], workspace / "frontend", env, run / "frontend.log"))
        write_session(run, session)
        await_ready(session)
        session["status"] = "running"
    except (OSError, ValueError, subprocess.SubprocessError, KeyboardInterrupt):
        stop_processes(session)
        session["status"] = "failed"
        write_session(run, session)
        raise
    write_session(run, session)
    return session


def main() -> int:
    """Expose repeatable preparation, identification and owned termination."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "status", "stop"])
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[4]))
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--backend-port", type=int, default=8031)
    parser.add_argument("--frontend-port", type=int, default=3031)
    parser.add_argument("--frontend-host", choices=["127.0.0.1", "localhost"], default="127.0.0.1")
    parser.add_argument("--overlay", action="append", default=[])
    parser.add_argument("--overlay-file")
    parser.add_argument("--node")
    args = parser.parse_args()
    try:
        repo = Path(args.repo_root).resolve()
        run = run_path(repo, args.run_id)
        if args.action == "start":
            session = start(args, repo, run)
        else:
            session = json.loads((run / "session.json").read_text(encoding="utf-8"))
            if session["repo_root"] != str(repo) or session["run_dir"] != str(run):
                raise ValueError("session path mismatch")
            if args.action == "stop":
                stop_processes(session)
                session["status"] = "stopped"
                write_session(run, session)
            elif session["status"] == "running":
                session["observed_alive"] = all(owned_process(row) is not None for row in session["processes"][:2])
                if not session["observed_alive"]:
                    session["status"] = "exited"
                else:
                    current = read_json(session["backend_url"] + "/api/app-session")
                    if current["boot_id"] != session["backend_boot"]["boot_id"]:
                        raise ValueError("backend boot ownership mismatch")
                    session["observed_ready"] = read_json(session["backend_url"] + "/health/ready")
                    if read_json(session["frontend_url"] + "/api/app-session")["boot_id"] != current["boot_id"]:
                        raise ValueError("frontend proxy ownership mismatch")
        print(json.dumps(session, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
