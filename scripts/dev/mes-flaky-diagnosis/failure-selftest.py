"""A deliberate non-MES assertion failure proves live evidence precedes cleanup."""
from __future__ import annotations
import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess

HERE = Path(__file__).resolve().parent

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--frontend', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--stalled-renderer', action='store_true')
    parser.add_argument('--test-timeout', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    root = (args.output / 'source').resolve()
    frontend = root / 'frontend'
    tests = frontend / 'tests/e2e'
    tests.mkdir(parents=True)
    (root / 'backend').mkdir()
    (root / '.mes-flaky-export.json').write_text(json.dumps({'source': str(root)}))
    (frontend / 'node_modules').symlink_to(args.frontend.resolve() / 'node_modules', target_is_directory=True)
    toolroot = root / 'scripts/dev/mes-flaky-diagnosis'
    toolroot.mkdir(parents=True)
    shutil.copy2(HERE / 'snapshot-db.py', toolroot / 'snapshot-db.py')
    database = root / 'backend/mes_e2e.db'
    with closing(sqlite3.connect(database)) as connection:
        connection.executescript('CREATE TABLE probe(value INTEGER); INSERT INTO probe VALUES(0);')
    cleanup = toolroot / 'cleanup.py'
    cleanup.write_text('import sqlite3,sys\nwith sqlite3.connect(sys.argv[1]) as db: db.execute("UPDATE probe SET value=1")\n')
    config = {'testDir': './tests/e2e', 'workers': 1, 'retries': 0, 'maxFailures': 1, 'timeout': 30000,
        'use': {'trace': 'on', 'headless': True, 'launchOptions':
            ({'executablePath': os.environ['MES_OBSERVER_CHROMIUM']} if os.environ.get('MES_OBSERVER_CHROMIUM') else {})},
        'outputDir': str(args.output / 'test-results'), 'reporter': [['json', {'outputFile': str(args.output / 'report.json')}]]}
    (frontend / 'guard.config.cjs').write_text('module.exports=' + json.dumps(config))
    (tests / 'guard.spec.ts').write_text('import {test,expect} from "@playwright/test";\nimport {execFileSync} from "node:child_process";\n'
        'test("observer-first-failure", async ({page})=>{await page.goto("data:text/html,<button>probe</button>");\n'
        + ('page.evaluate = () => new Promise(() => {});\n' if args.stalled_renderer else '')
        + ('test.setTimeout(1000); await new Promise(() => {});' if args.test_timeout else '')
        + 'try {expect(1,"deliberate guard assertion").toBe(2);} finally {execFileSync("python",'
        + json.dumps([str(cleanup), str(database)]) + ');}});\n')
    if args.test_timeout:
        with (tests / 'guard.spec.ts').open('a') as stream:
            stream.write('test.afterEach(async () => {execFileSync("python",' + json.dumps([str(cleanup), str(database)]) + ');});\n')
    subprocess.run(['node', str(HERE / 'instrument-failure.cjs'), str(root), str(args.output / 'instrument.json')], check=True)
    env = {**os.environ, 'MES_DIAG_SOURCE': str(root), 'MES_DIAG_OUTPUT': str(args.output.resolve())}
    with (args.output / 'runner.log').open('w') as log:
        result = subprocess.run(['node', str(frontend / 'node_modules/playwright/cli.js'), 'test', '--config=guard.config.cjs'],
            cwd=frontend, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=60)
    assert result.returncode == 1, 'the intentional original assertion must still fail'
    report = json.loads((args.output / 'report.json').read_text())
    assert report['stats']['unexpected'] == 1 and report['stats']['expected'] == 0
    original_result = report['suites'][0]['specs'][0]['tests'][0]['results'][0]
    expected_error = 'Test timeout of 1000ms exceeded' if args.test_timeout else 'deliberate guard assertion'
    assert expected_error in original_result['error']['message'], original_result['error']['message']
    events = [json.loads(line) for line in (args.output / 'failure-boundaries.jsonl').read_text().splitlines()]
    frozen = next(row for row in events if row['event'] == 'failure.frozen')
    complete = next(row for row in events if row['event'] == 'failure.collection.finished')
    cleanup_event = next(row for row in events if row['event'] == 'cleanup.begin')
    assert int(frozen['mono_ns']) < int(complete['mono_ns']) < int(cleanup_event['mono_ns'])
    receipt_path = next((args.output / 'first-failures').glob('*/receipt.json'))
    receipt = json.loads(receipt_path.read_text())
    assert receipt['status'] == ('partial' if args.stalled_renderer else 'complete'), receipt
    if args.stalled_renderer:
        assert [row['name'] for row in receipt['errors']] == ['bom']
    with closing(sqlite3.connect(receipt_path.parent / 'before-cleanup.db')) as snapshot:
        assert snapshot.execute('SELECT value FROM probe').fetchone()[0] == 0
    with closing(sqlite3.connect(database)) as current:
        assert current.execute('SELECT value FROM probe').fetchone()[0] == 1
    assert (receipt_path.parent / 'before-cleanup-trace.zip').stat().st_size > 0
    evidence = {'passed': True, 'scope': 'observer guard only, not the original MES failure',
        'original_assertion_preserved': True, 'before_cleanup_value': 0, 'after_cleanup_value': 1,
        'browser_trace_before_cleanup': True, 'stalled_renderer_bounded': args.stalled_renderer, 'test_timeout_capture': args.test_timeout,
        'independent_api_trace': 'standard final artifact with cutoff'}
    (args.output / 'selftest-result.json').write_text(json.dumps(evidence, indent=2))
    print(json.dumps(evidence))

if __name__ == '__main__':
    main()
