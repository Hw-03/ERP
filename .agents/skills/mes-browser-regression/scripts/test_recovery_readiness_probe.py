"""가짜 시간과 응답으로 90초 전체 기한을 검사하며 실제 I/O는 없다."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest

HERE = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8042/health/ready"


@pytest.fixture
def probe(monkeypatch):
    spec = importlib.util.spec_from_file_location("readiness_adapter_test", HERE / "recovery_readiness_probe.py")
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    clock = SimpleNamespace(now=0.0, requests=[], sleeps=[], replies=[])

    def sleep(delay):
        assert 0 < delay <= 0.25
        assert clock.now + delay <= 90
        clock.sleeps.append(delay)
        clock.now += delay

    class Response:
        def __init__(self, status, destination, read_delay):
            self.status, self.destination, self.read_delay = status, destination, read_delay

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def geturl(self):
            return self.destination

        def read(self):
            clock.now += self.read_delay
            return b'healthy'

    def request(url, timeout):
        assert url == URL
        assert 0 < timeout <= min(10, 90 - clock.now)
        clock.requests.append((clock.now, timeout))
        duration, status, destination, read_delay = clock.replies.pop(0) if clock.replies else (20, 200, URL, 0)
        if duration > timeout:
            clock.now += timeout
            raise TimeoutError("synthetic socket timeout")
        clock.now += duration
        if status == 503:
            raise HTTPError(url, status, "unavailable", {}, None)
        return Response(status, destination, read_delay)

    monkeypatch.setattr(helper, "time", SimpleNamespace(monotonic=lambda: clock.now, sleep=sleep))
    monkeypatch.setattr(helper, "urlopen", request)
    lifecycle = SimpleNamespace(processes={"backend": (SimpleNamespace(poll=lambda: None), {}, None)})
    return helper, lifecycle, clock


def test_three_second_200_finishes_once(probe):
    helper, lifecycle, clock = probe
    clock.replies = [(3, 200, URL, 0)]
    assert helper.bounded_probe(lifecycle, URL) == b'healthy'
    assert clock.now == 3 and len(clock.requests) == 1 and clock.sleeps == []


def test_ten_second_timeout_retries_with_remaining_budget(probe):
    helper, lifecycle, clock = probe
    clock.replies = [(11, 200, URL, 0), (3, 200, URL, 0)]
    assert helper.bounded_probe(lifecycle, URL) == b'healthy'
    assert clock.requests == [(0, 10), (10.25, 10)] and clock.now == 13.25


def test_503_retries_without_reporting_ready(probe):
    helper, lifecycle, clock = probe
    clock.replies = [(0.5, 503, URL, 0), (3, 200, URL, 0)]
    assert helper.bounded_probe(lifecycle, URL) == b'healthy'
    assert clock.now == 3.75 and len(clock.requests) == 2


def test_ninety_seconds_exhausts_without_extending_deadline(probe):
    helper, lifecycle, clock = probe
    with pytest.raises(helper.harness.release.ReleaseError, match="readiness timed out"):
        helper.bounded_probe(lifecycle, URL)
    assert clock.now == 90
    assert clock.requests[-1] == (82.0, 8.0)


def test_remaining_under_two_seconds_limits_socket_and_sleep(probe):
    helper, lifecycle, clock = probe
    clock.replies = [(9.64, 503, URL, 0)] * 9
    with pytest.raises(helper.harness.release.ReleaseError, match="readiness timed out"):
        helper.bounded_probe(lifecycle, URL)
    assert clock.now == pytest.approx(90)
    assert 0 < clock.requests[-1][1] < 2


def test_sleep_never_exceeds_remaining_time(probe):
    helper, lifecycle, clock = probe
    clock.replies = [(9.74, 503, URL, 0)] * 9 + [(0.07, 503, URL, 0)]
    with pytest.raises(helper.harness.release.ReleaseError, match="readiness timed out"):
        helper.bounded_probe(lifecycle, URL)
    assert clock.now == pytest.approx(90)
    assert 0 < clock.sleeps[-1] < 0.25


@pytest.mark.parametrize("status,destination", [(201, URL), (200, URL + "/redirected")])
def test_wrong_status_or_redirect_is_not_ready(probe, status, destination):
    helper, lifecycle, clock = probe
    clock.replies = [(0.5, status, destination, 0), (3, 200, URL, 0)]
    assert helper.bounded_probe(lifecycle, URL) == b'healthy'
    assert len(clock.requests) == 2


def test_response_body_after_deadline_is_not_success(probe):
    helper, lifecycle, clock = probe
    clock.replies = [(1, 200, URL, 90)]
    with pytest.raises(helper.harness.release.ReleaseError, match="readiness timed out"):
        helper.bounded_probe(lifecycle, URL)


def test_exited_process_fails_before_network(probe):
    helper, lifecycle, clock = probe
    lifecycle.processes["backend"][0].poll = lambda: 1
    with pytest.raises(helper.harness.release.ReleaseError, match="process exited"):
        helper.bounded_probe(lifecycle, URL)
    assert clock.requests == []


def test_only_probe_is_temporarily_replaced_and_restored(probe):
    helper, _, _ = probe
    cls = helper.harness.IsolatedLifecycle
    before = dict(vars(cls))
    with pytest.raises(RuntimeError, match="synthetic"):
        with helper.bounded_readiness():
            assert cls._probe is helper.bounded_probe
            assert {key: value for key, value in vars(cls).items() if key != "_probe"} == {key: value for key, value in before.items() if key != "_probe"}
            raise RuntimeError("synthetic")
    assert dict(vars(cls)) == before


@pytest.mark.parametrize("line_ending", [b"\n", b"\r\n"])
def test_checkout_line_endings_preserve_harness_contract(probe, monkeypatch, line_ending):
    helper, _, _ = probe
    source = helper.ROOT / "backend/tests/ops/recovery_rehearsal.py"
    normalized = source.read_bytes().replace(b"\r\n", b"\n")
    monkeypatch.setattr(helper.Path, "read_bytes", lambda self: normalized.replace(b"\n", line_ending))
    original = helper.harness.IsolatedLifecycle._probe
    with helper.bounded_readiness():
        assert helper.harness.IsolatedLifecycle._probe is helper.bounded_probe
    assert helper.harness.IsolatedLifecycle._probe is original


def test_real_harness_content_change_is_rejected(probe, monkeypatch):
    helper, _, _ = probe
    source = helper.ROOT / "backend/tests/ops/recovery_rehearsal.py"
    changed = source.read_bytes().replace(b"\r\n", b"\n") + b"# changed contract\n"
    monkeypatch.setattr(helper.Path, "read_bytes", lambda self: changed)
    original = helper.harness.IsolatedLifecycle._probe
    with pytest.raises(helper.harness.release.ReleaseError, match="harness source changed"):
        with helper.bounded_readiness():
            pytest.fail("Changed harness must not activate the adapter")
    assert helper.harness.IsolatedLifecycle._probe is original
