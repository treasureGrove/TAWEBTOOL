"""Verify public tools HTML and preserved downloads against this fixed batch."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
WORK = REPO / 'tmp/lolicode-canonical-20261027'
spec = importlib.util.spec_from_file_location('canonical_deploy', HERE / 'deploy-canonical-tools.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class Metadata(HTMLParser):
    def __init__(self, data):
        super().__init__()
        self.canonical = []
        self.og = []
        self.feed(data.decode())

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == 'link' and attributes.get('rel') == 'canonical':
            self.canonical.append(attributes.get('href'))
        if tag == 'meta' and attributes.get('property') == 'og:url':
            self.og.append(attributes.get('content'))


def get(path):
    with urlopen('https://tools.treasuregrove.art/lolicode/' + path, timeout=20) as response:
        assert response.status == 200
        return response.read()


def verify():
    before = (WORK / 'before-live/tools-index.html').read_bytes()
    expected = deploy.revision(before)
    public = get('')
    assert public == expected
    metadata = Metadata(public)
    assert metadata.canonical == metadata.og == ['https://lolicode.com/']

    def unchanged(item):
        name, digest = item
        assert hashlib.sha256(get(name)).hexdigest() == digest, name
        return name

    with ThreadPoolExecutor(max_workers=5) as pool:
        checked = list(pool.map(unchanged, deploy.RETAIN_SHA.items()))
    result = {'batch': deploy.BATCH, 'passed': True, 'canonical': metadata.canonical[0],
              'ogUrl': metadata.og[0], 'beforeSHA256': deploy.BEFORE_SHA,
              'afterSHA256': hashlib.sha256(public).hexdigest(), 'retainedFiles': checked,
              'onlyDiff': 'Two public head URLs; all other HTML bytes identical',
              'backup': deploy.PRIVATE.as_posix()}
    (WORK / 'tools-after.html').write_bytes(public)
    output = HERE / 'canonical-tools-20261027-proof.json'
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    verify()
