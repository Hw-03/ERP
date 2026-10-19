"""Extract first-attempt order from the preserved original HTML report, without rerunning it."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

def extract(directory: Path) -> dict:
    """HTML file order is failure-priority order; timestamps define actual starts."""
    path = directory / 'report.json'
    report = json.loads(path.read_text(encoding='utf-8'))
    hashes = {'report.json': hashlib.sha256(path.read_bytes()).hexdigest()}
    attempts = []
    for file in report['files']:
        detail_path = directory / (file['fileId'] + '.json')
        hashes[detail_path.name] = hashlib.sha256(detail_path.read_bytes()).hexdigest()
        details = {test['testId']: test for test in json.loads(detail_path.read_text(encoding='utf-8'))['tests']}
        for test in file['tests']:
            for summary, result in zip(test['results'], details[test['testId']]['results'], strict=True):
                attempts.append({'identity': [test['projectName'], file['fileName'], *test['path'], test['title']],
                    'start': summary['startTime'], 'worker': summary['workerIndex'],
                    'retry': result['retry'], 'status': result['status']})
    attempts.sort(key=lambda row: row['start'])
    first = [row for row in attempts if row['retry'] == 0]
    if len({json.dumps(row['identity'], ensure_ascii=True) for row in first}) != len(first):
        raise ValueError('duplicate first-attempt test identity')
    return {'schema': 1, 'original_ci': report['metadata']['ci'], 'source_hashes': hashes,
        'original_attempts': attempts, 'first_attempt_order': [row['identity'] for row in first],
        'selection': {'grep_invert': '(^|[ /])as-research-(ui-)?expectations[.]spec[.]ts( |$)'},
        'new_policy': {'workers': 1, 'retries': 0, 'repeat_each': 1, 'max_failures': 1,
            'retry_worker_restarts_replayed': False}}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--report-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    value = extract(args.report_dir)
    with args.output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, ensure_ascii=True, indent=2)
        stream.write('\n')
    print(json.dumps({'first_attempts': len(value['first_attempt_order']), 'attempts': len(value['original_attempts'])}))
