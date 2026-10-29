#!/usr/bin/env python3
"""Frozen two-field tools-page canonical change; no services or download writes.

Server usage (root): python3 deploy.py check|apply|restore
Local offline exercises: python deploy-canonical-tools.py --self-test
"""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid

BATCH = '20261027-canonical-tools-v1'
SITE = Path('/www/wwwroot/tools.treasuregrove.art/lolicode')
PRIVATE = Path('/root/lolicode-' + BATCH)
BEFORE_SHA = 'b237f7eba3d2aa2bf4b0d63495814b64021621339b04bac47089592f3c490c12'
AFTER_SHA = '4ab1c229ab586ad09a1987aeb88c622db56977f14b89300c680b6fe19edea361'
RETAIN_SHA = {
    'assets/downloads.js': '4466ca7770d15a3a02107da726497da5261ab826a2636280face74c331abaa10',
    'assets/site.css': 'a72350d4466ec249ccc34c0e58f91bccd7e0fbe159632d800e97d3a64e0de4da',
    'assets/motion.js': '6e93ac782670e2d8f5c14f8d9b44820c9bb8d34c721edd0f9c5efa0aeb3600cf',
    'updates/latest.json': 'c70d19324d168aa6703a50adc608086a278ab3511eb3ab5089bb6706331945aa',
    'sitemap-desktop.xml': 'aebb12679120060af83192ebf9d20d6438bada0bab0237f907a75c8cec5c773a',
}
OLD_URL = b'https://tools.treasuregrove.art/lolicode/'
NEW_URL = b'https://lolicode.com/'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError('Expected a plain file: ' + str(path))
    return path.read_bytes()


def checked(path, digest):
    data = plain(path)
    if sha(data) != digest:
        raise RuntimeError('Baseline or concurrent change: ' + str(path))
    return data


def metadata(path):
    attrs = path.lstat()
    if not stat.S_ISREG(attrs.st_mode):
        raise RuntimeError('Expected a plain target: ' + str(path))
    return {'mode': stat.S_IMODE(attrs.st_mode), 'uid': attrs.st_uid, 'gid': attrs.st_gid}


def sync_directory(path):
    if os.name != 'nt':
        descriptor = os.open(path, os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def atomic(path, data, attrs=None):
    if path.is_symlink():
        raise RuntimeError('Refusing symlink target: ' + str(path))
    temporary = path.with_name(path.name + '.' + str(uuid.uuid4()) + '.tmp')
    attrs = attrs or {'mode': 0o600, 'uid': 0, 'gid': 0}
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if os.name != 'nt':
            os.chown(temporary, attrs['uid'], attrs['gid'])
        temporary.chmod(attrs['mode'])
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


def immutable(path, data):
    if path.exists() or path.is_symlink():
        if plain(path) != data:
            raise RuntimeError('Private immutable backup differs: ' + str(path))
    else:
        atomic(path, data)
    if os.name != 'nt' and (path.stat().st_uid != 0 or stat.S_IMODE(path.stat().st_mode) & 0o077):
        raise RuntimeError('Backup must be root-private: ' + str(path))


def private_directory():
    if PRIVATE.is_symlink():
        raise RuntimeError('Private backup directory cannot be a symlink')
    if not PRIVATE.exists():
        PRIVATE.mkdir(mode=0o700)
    if not PRIVATE.is_dir():
        raise RuntimeError('Expected private directory')
    if os.name != 'nt' and (PRIVATE.stat().st_uid != 0 or stat.S_IMODE(PRIVATE.stat().st_mode) & 0o077):
        raise RuntimeError('Private backup directory must be owned by root, mode 0700')


@contextmanager
def publication_lock():
    if SITE.is_symlink() or not SITE.is_dir():
        raise RuntimeError('Expected a real tools-site directory')
    lock = SITE / '.publish-lock'
    lock.mkdir(mode=0o700)
    identity = lock.lstat()
    try:
        yield
    finally:
        current = lock.lstat()
        if (current.st_dev, current.st_ino) != (identity.st_dev, identity.st_ino):
            raise RuntimeError('Publication lock was replaced; refusing to remove it')
        lock.rmdir()


def retained():
    for name, digest in RETAIN_SHA.items():
        checked(SITE / name, digest)


def revision(before):
    patterns = [
        rb'(<link\s+rel="canonical"\s+href=")' + re.escape(OLD_URL) + rb'("\s*/>)',
        rb'(<meta\s+property="og:url"\s+content=")' + re.escape(OLD_URL) + rb'("\s*/>)',
    ]
    if sha(before) != BEFORE_SHA or before.count(OLD_URL) != 2:
        raise RuntimeError('Unexpected frozen source HTML')
    after = before
    for pattern in patterns:
        if len(re.findall(pattern, after)) != 1:
            raise RuntimeError('Expected exactly one owned head marker')
        after = re.sub(pattern, lambda match: match[1] + NEW_URL + match[2], after, count=1)
    if after != before.replace(OLD_URL, NEW_URL) or sha(after) != AFTER_SHA:
        raise RuntimeError('Unexpected HTML byte diff')
    return after


def before_and_after():
    before = checked(PRIVATE / 'index.before.html', BEFORE_SHA)
    after = checked(PRIVATE / 'index.after.html', AFTER_SHA)
    if after != revision(before):
        raise RuntimeError('Backup revision differs')
    attrs = json.loads(plain(PRIVATE / 'index.metadata.json'))
    if set(attrs) != {'mode', 'uid', 'gid'} or any(type(value) is not int or value < 0 for value in attrs.values()):
        raise RuntimeError('Invalid original metadata')
    if attrs['mode'] > 0o7777:
        raise RuntimeError('Invalid original file mode')
    return before, after, attrs


def replace_checked(expected, replacement, attrs):
    target = SITE / 'index.html'
    if plain(target) != expected or metadata(target) != attrs:
        raise RuntimeError('Concurrent target edit or metadata change; refusing overwrite')
    atomic(target, replacement, attrs)


def result(state):
    return {'batch': BATCH, 'state': state, 'target': str(SITE / 'index.html'),
            'beforeSHA256': BEFORE_SHA, 'afterSHA256': AFTER_SHA,
            'retainedFiles': RETAIN_SHA, 'backup': str(PRIVATE)}


def check():
    """Only reads live files; never creates a directory, lock or backup."""
    if SITE.is_symlink() or not SITE.is_dir():
        raise RuntimeError('Expected a real tools-site directory')
    retained()
    current = plain(SITE / 'index.html')
    current_sha = sha(current)
    if current_sha == BEFORE_SHA:
        revision(current)
        state = 'ready'
    elif current_sha == AFTER_SHA:
        state = 'already-applied'
    else:
        raise RuntimeError('Current HTML is neither frozen before nor after revision')
    return result(state) | {'currentSHA256': current_sha, 'metadata': metadata(SITE / 'index.html'),
                            'publicationLockExists': (SITE / '.publish-lock').exists()}


def apply():
    with publication_lock():
        retained()
        current = plain(SITE / 'index.html')
        if sha(current) == AFTER_SHA:
            before, after, attrs = before_and_after()
            if metadata(SITE / 'index.html') != attrs:
                raise RuntimeError('Installed metadata changed')
            return result('already-applied')
        before = checked(SITE / 'index.html', BEFORE_SHA)
        after = revision(before)
        attrs = metadata(SITE / 'index.html')
        private_directory()
        immutable(PRIVATE / 'index.before.html', before)
        immutable(PRIVATE / 'index.after.html', after)
        immutable(PRIVATE / 'index.metadata.json', (json.dumps(attrs, sort_keys=True) + '\n').encode())
        replaced = False
        try:
            retained()
            replace_checked(before, after, attrs)
            replaced = True
            checked(SITE / 'index.html', AFTER_SHA)
            if metadata(SITE / 'index.html') != attrs:
                raise RuntimeError('Installed ownership/mode differs')
            retained()
        except Exception:
            if replaced:
                if plain(SITE / 'index.html') != after or metadata(SITE / 'index.html') != attrs:
                    raise RuntimeError('Concurrent change after publication; retained backups without rollback')
                replace_checked(after, before, attrs)
                checked(SITE / 'index.html', BEFORE_SHA)
            raise
        return result('applied')


def restore():
    with publication_lock():
        before, after, attrs = before_and_after()
        retained()
        current = plain(SITE / 'index.html')
        if current == before:
            if metadata(SITE / 'index.html') != attrs:
                raise RuntimeError('Restored metadata changed')
            return result('already-restored')
        if current != after or metadata(SITE / 'index.html') != attrs:
            raise RuntimeError('Concurrent HTML/metadata change; refusing restoration')
        replaced = False
        try:
            replace_checked(after, before, attrs)
            replaced = True
            checked(SITE / 'index.html', BEFORE_SHA)
            retained()
        except Exception:
            if replaced:
                if plain(SITE / 'index.html') != before or metadata(SITE / 'index.html') != attrs:
                    raise RuntimeError('Concurrent change during restoration; retained backups')
                replace_checked(before, after, attrs)
            raise
        return result('restored')


def self_test():
    """Exercise real file replacements, restoration and rejection of concurrent edits."""
    import tempfile
    global SITE, PRIVATE, BEFORE_SHA, AFTER_SHA, RETAIN_SHA, retained
    saved = SITE, PRIVATE, BEFORE_SHA, AFTER_SHA, RETAIN_SHA, retained
    try:
        with tempfile.TemporaryDirectory(prefix='lolicode-canonical-tools-') as tmp:
            SITE = Path(tmp) / 'site'
            PRIVATE = Path(tmp) / 'private'
            SITE.mkdir()
            before = (b'<head><link rel="canonical" href="' + OLD_URL + b'" />\n'
                      b'<meta\n property="og:url"\n content="' + OLD_URL + b'" /></head>\nUNRELATED CONTENT')
            after = before.replace(OLD_URL, NEW_URL)
            BEFORE_SHA, AFTER_SHA = sha(before), sha(after)
            RETAIN_SHA = {'downloads.js': sha(b'keep download')}
            atomic(SITE / 'index.html', before, {'mode': 0o644, 'uid': 0, 'gid': 0})
            atomic(SITE / 'downloads.js', b'keep download')
            original_attrs = metadata(SITE / 'index.html')
            assert check()['state'] == 'ready' and not PRIVATE.exists()
            assert apply()['state'] == 'applied' and plain(SITE / 'index.html') == after
            assert metadata(SITE / 'index.html') == original_attrs
            assert apply()['state'] == 'already-applied'
            assert restore()['state'] == 'restored' and plain(SITE / 'index.html') == before
            assert restore()['state'] == 'already-restored'
            assert apply()['state'] == 'applied'
            atomic(SITE / 'index.html', b'concurrent HTML', original_attrs)
            try:
                restore()
                raise AssertionError('Concurrent HTML was overwritten')
            except RuntimeError:
                assert plain(SITE / 'index.html') == b'concurrent HTML'
            atomic(SITE / 'index.html', before, original_attrs)
            real_retained = retained
            calls = []
            def fail_after_replace():
                calls.append(1)
                if len(calls) == 3:
                    raise RuntimeError('injected post-write check failure')
                real_retained()
            retained = fail_after_replace
            try:
                apply()
                raise AssertionError('Post-write failure ignored')
            except RuntimeError:
                assert plain(SITE / 'index.html') == before
            retained = real_retained
            calls.clear()
            def concurrent_after_replace():
                calls.append(1)
                if len(calls) == 3:
                    atomic(SITE / 'index.html', b'newer concurrent HTML', original_attrs)
                    raise RuntimeError('injected concurrent post-write change')
                real_retained()
            retained = concurrent_after_replace
            try:
                apply()
                raise AssertionError('Concurrent post-write change ignored')
            except RuntimeError:
                assert plain(SITE / 'index.html') == b'newer concurrent HTML'
            retained = real_retained
            atomic(SITE / 'index.html', before, original_attrs)
            (SITE / '.publish-lock').mkdir()
            try:
                apply()
                raise AssertionError('Existing publication lock ignored')
            except FileExistsError:
                assert plain(SITE / 'index.html') == before
            (SITE / '.publish-lock').rmdir()
            atomic(SITE / 'downloads.js', b'concurrent release')
            try:
                apply()
                raise AssertionError('Changed retained asset ignored')
            except RuntimeError:
                assert plain(SITE / 'index.html') == before
            assert not (SITE / '.publish-lock').exists()
        print(json.dumps({'state': 'self-test-passed', 'checks': 10}))
    finally:
        SITE, PRIVATE, BEFORE_SHA, AFTER_SHA, RETAIN_SHA, retained = saved


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        actions = {'check': check, 'apply': apply, 'restore': restore}
        if not hasattr(os, 'geteuid') or os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in actions:
            raise RuntimeError('Expected check/apply/restore as root')
        print(json.dumps(actions[sys.argv[1]](), indent=2))
