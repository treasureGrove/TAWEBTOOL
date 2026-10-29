#!/usr/bin/env python3
"""Frozen direct-host noindex change, isolated from the shared forum include.

Root server actions: check (read-only), preview (private nginx -t), apply, restore.
The mirror snapshot must be regenerated whenever /var/www/forum/.nginx.conf changes.
Every check/action rejects shared-include drift; this script never edits that file.
"""
from contextlib import contextmanager
import hashlib
import glob
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import uuid

BATCH = '20261027-mirror-noindex-v1'
PRIVATE = Path('/root/lolicode-' + BATCH)
DIRECT = Path('/etc/nginx/sites-enabled/direct.conf')
ENABLED = Path('/etc/nginx/sites-enabled')
CONF_D = Path('/etc/nginx/conf.d')
NGINX = Path('/etc/nginx/nginx.conf')
MAIN = Path('/etc/nginx/sites-available/lolicode.conf')
SHARED = Path('/var/www/forum/.nginx.conf')
FASTCGI = Path('/etc/nginx/fastcgi_params')
INCLUDE = Path('/etc/nginx/snippets/direct-noindex-flarum-20261027.conf')
LOCK = Path('/run/lock/lolicode-forum-maintenance.lock')
MAINTENANCE = Path('/var/www/ops/MAINTENANCE_ON')
BEFORE_SHA = '1a9ef01f57720d999b9c66705e4ac4cd0eac858ec203680dc0b1f659c3adbcc3'
AFTER_SHA = '26689dd05e9eddc5519b72c4e70c5b34cde016bca52af91458e7b854830b8c17'
SHARED_SHA = '2cccc136040476deed8aa9d00e26ccca4a3a02ab95e68943fb763d820a54187a'
INCLUDE_SHA = 'fc2ec28b6657823843bc8264b109a4439fda7de755cd2e2be8967059beaba2fd'
MAIN_SHA = 'e401097065f05e3a4e9a6b180b33dec514966bd3526e5c68fa322c8fd27a5949'
NGINX_SHA = '48c6a4ec1e1fd28ccf968490f07e34a1d7f755793b2108a3ed8670b1ee2a0aa2'
FASTCGI_SHA = '4e0945432e68d9d7cac62356766fbea8652790c15a7332a42af1a78877225c32'
HEADER = b'add_header X-Robots-Tag "noindex, nofollow" always;'
HTTPS_ANCHOR = b'    listen 443 ssl http2;\n    listen [::]:443 ssl http2;\n    server_name direct.lolicode.com;\n'
SHARED_LINE = b'    include /var/www/forum/.nginx.conf;'
SITES_ANCHOR = b'\tinclude /etc/nginx/sites-enabled/*;'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError('Expected plain file: ' + str(path))
    return path.read_bytes()


def checked(path, digest):
    data = plain(path)
    if sha(data) != digest:
        raise RuntimeError('Baseline/concurrent change: ' + str(path))
    return data


def attrs(path):
    value = path.lstat()
    if not stat.S_ISREG(value.st_mode):
        raise RuntimeError('Expected a plain configuration file')
    return {'mode': stat.S_IMODE(value.st_mode), 'uid': value.st_uid, 'gid': value.st_gid}


def sync_directory(path):
    if os.name != 'nt':
        descriptor = os.open(path, os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def atomic(path, data, mode=0o600, owner=None):
    if path.is_symlink():
        raise RuntimeError('Refusing symlink target: ' + str(path))
    temporary = path.with_name(path.name + '.' + str(uuid.uuid4()) + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if os.name != 'nt':
            os.chown(temporary, *(owner or (0, 0)))
        temporary.chmod(mode)
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


def immutable(path, data, mode=0o600):
    if path.exists() or path.is_symlink():
        if plain(path) != data:
            raise RuntimeError('Immutable backup/include differs: ' + str(path))
    else:
        atomic(path, data, mode)
    if os.name != 'nt' and (path.stat().st_uid != 0 or stat.S_IMODE(path.stat().st_mode) != mode):
        raise RuntimeError('Unexpected private/config ownership or mode: ' + str(path))


def private_directory():
    if PRIVATE.is_symlink():
        raise RuntimeError('Private path cannot be a symlink')
    if not PRIVATE.exists():
        PRIVATE.mkdir(mode=0o700)
    if not PRIVATE.is_dir() or (os.name != 'nt' and (PRIVATE.stat().st_uid != 0 or stat.S_IMODE(PRIVATE.stat().st_mode) != 0o700)):
        raise RuntimeError('Expected root-private 0700 backup directory')


@contextmanager
def maintenance_lock():
    import fcntl
    if LOCK.is_symlink():
        raise RuntimeError('Unexpected lock symlink')
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if MAINTENANCE.exists():
            raise RuntimeError('Existing maintenance mode left unchanged')
        yield


def mirror_include(shared):
    if sha(shared) != SHARED_SHA:
        raise RuntimeError('Shared Flarum include changed; regenerate mirror snapshot before proceeding')
    pattern = rb'(?m)^(  add_header Cache-Control [^\n]+\n)'
    if len(re.findall(pattern, shared)) != 5 or len(re.findall(rb'(?m)^\s*add_header\b', shared)) != 5:
        raise RuntimeError('Unexpected child-location header structure')
    if re.search(rb'(?m)^\s*include\b', shared) or b'X-Robots-Tag' in shared:
        raise RuntimeError('Unexpected nested include or robots header')
    comment = (b'# Mirror-only snapshot of /var/www/forum/.nginx.conf.\n# Source SHA256: ' + SHARED_SHA.encode()
               + b'\n# Regenerate this snapshot whenever the shared include changes.\n')
    result = comment + re.sub(pattern, lambda match: match[1] + b'  ' + HEADER + b'\n', shared)
    if sha(result) != INCLUDE_SHA or result.count(HEADER) != 5:
        raise RuntimeError('Unexpected mirror include diff')
    if result[len(comment):].replace(b'  ' + HEADER + b'\n', b'') != shared:
        raise RuntimeError('Shared rules were changed')
    return result


def direct_after(before):
    if sha(before) != BEFORE_SHA or before.count(HTTPS_ANCHOR) != 1 or before.count(SHARED_LINE) != 1:
        raise RuntimeError('Unexpected direct vhost baseline')
    if HEADER in before or b'X-Robots-Tag' in before:
        raise RuntimeError('Unexpected existing robots headers')
    updated = before.replace(HTTPS_ANCHOR, HTTPS_ANCHOR + b'    ' + HEADER + b'\n')
    new_line = ('    include ' + INCLUDE.as_posix() + ';').encode()
    updated = updated.replace(SHARED_LINE, new_line)
    if sha(updated) != AFTER_SHA or updated.replace(b'    ' + HEADER + b'\n', b'').replace(new_line, SHARED_LINE) != before:
        raise RuntimeError('Unexpected direct configuration diff')
    return updated


def directory_snapshot(directory):
    result = {}
    if directory.is_symlink() or not directory.is_dir():
        raise RuntimeError('Expected real configuration directory')
    for path in sorted(directory.iterdir()):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', path.name) or not path.is_file():
            raise RuntimeError('Unexpected enabled configuration entry')
        result[path.name] = {'target': str(path.resolve()), 'sha256': sha(path.read_bytes())}
    return result


def relative_includes():
    """Discover includes from the active closure using the real config prefix.

    With nginx -c /root/.../candidate.conf, bare include names resolve under the
    candidate's directory. Freeze and copy every currently active relative include;
    unknown future relative paths require a reviewed update instead of a guess.
    """
    visited = set()
    found = {}
    prefix = NGINX.parent

    def walk(path):
        path = Path(path)
        if str(path) in visited:
            return
        visited.add(str(path))
        for match in re.finditer(rb'(?m)^\s*include\s+([^;\n]+);', path.read_bytes()):
            name = match[1].decode().strip().strip('"').strip("'")
            if '$' in name:
                raise RuntimeError('Dynamic include needs explicit private-preview review')
            relative = not name.startswith('/') and not Path(name).is_absolute()
            target = prefix / name if relative else Path(name)
            matches = sorted(glob.glob(str(target)))
            if relative:
                if not re.fullmatch(r'[A-Za-z0-9_.-]+', name) or len(matches) != 1:
                    raise RuntimeError('Unexpected relative include path: ' + name)
                found[name] = sha(Path(matches[0]).read_bytes())
            for included in matches:
                walk(included)

    walk(NGINX)
    if found != {'fastcgi_params': FASTCGI_SHA}:
        raise RuntimeError('Active relative includes changed; freeze and prepare all dependencies before preview')
    return found


def environment():
    checked(MAIN, MAIN_SHA)
    checked(NGINX, NGINX_SHA)
    checked(FASTCGI, FASTCGI_SHA)
    shared = plain(SHARED)
    if sha(shared) != SHARED_SHA:
        raise RuntimeError('SHARED INCLUDE DRIFT: regenerate mirror snapshot to retain new forum/security rules')
    configs = directory_snapshot(CONF_D)
    # A server-level add_header would suppress any inherited http-level headers.
    # Reject such future drift rather than silently dropping a security header.
    for path in [NGINX, *sorted(CONF_D.iterdir())]:
        if re.search(rb'(?m)^\s*add_header\b', path.read_bytes()):
            raise RuntimeError('Global add_header detected; review inheritance before this batch')
    enabled = directory_snapshot(ENABLED)
    if DIRECT.name not in enabled or DIRECT.is_symlink():
        raise RuntimeError('direct.conf must remain the real enabled file')
    enabled[DIRECT.name]['sha256'] = BEFORE_SHA  # Normalize only this batch's before/after edit.
    return {'main': MAIN_SHA, 'nginx': NGINX_SHA, 'fastcgi': FASTCGI_SHA,
            'shared': SHARED_SHA, 'enabled': enabled, 'confD': configs,
            'relativeIncludes': relative_includes()}


def nginx_test(config=None):
    command = ['nginx', '-t']
    if config is not None:
        command += ['-c', str(config)]
    subprocess.run(command, check=True)


def nginx_reload():
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)


def validate_preview(before, expected_environment):
    private_directory()
    for name, digest in expected_environment['relativeIncludes'].items():
        immutable(PRIVATE / name, checked(NGINX.parent / name, digest))
    candidate_include = PRIVATE / 'mirror-preview-include.conf'
    candidate_direct = PRIVATE / 'mirror-preview-direct.conf'
    candidate_main = PRIVATE / 'mirror-preview-nginx.conf'
    immutable(candidate_include, mirror_include(checked(SHARED, SHARED_SHA)))
    direct = direct_after(before).replace(INCLUDE.as_posix().encode(), candidate_include.as_posix().encode())
    immutable(candidate_direct, direct)
    original_main = checked(NGINX, NGINX_SHA)
    if original_main.count(SITES_ANCHOR) != 1:
        raise RuntimeError('Expected one sites-enabled wildcard include')
    lines = []
    for name in expected_environment['enabled']:
        path = candidate_direct if name == DIRECT.name else ENABLED / name
        lines.append(('\tinclude ' + path.as_posix() + ';').encode())
    immutable(candidate_main, original_main.replace(SITES_ANCHOR, b'\n'.join(lines)))
    if environment() != expected_environment or plain(DIRECT) != before:
        raise RuntimeError('Concurrent configuration edit before private validation')
    nginx_test(candidate_main)
    if environment() != expected_environment or plain(DIRECT) != before:
        raise RuntimeError('Concurrent configuration edit during private validation')
    proof = {'batch': BATCH, 'directSHA256': AFTER_SHA, 'includeSHA256': INCLUDE_SHA,
             'environment': expected_environment, 'passed': True}
    immutable(PRIVATE / 'preview-verified.json', (json.dumps(proof, sort_keys=True, indent=2) + '\n').encode())
    return proof


def check():
    current_environment = environment()
    shared = mirror_include(checked(SHARED, SHARED_SHA))
    current = plain(DIRECT)
    if sha(current) == BEFORE_SHA:
        direct_after(current)
        state = 'ready'
    elif sha(current) == AFTER_SHA:
        checked(INCLUDE, INCLUDE_SHA)
        state = 'already-applied'
    else:
        raise RuntimeError('Direct vhost has an unrelated modification')
    return {'batch': BATCH, 'state': state, 'directBeforeSHA256': BEFORE_SHA,
            'directAfterSHA256': AFTER_SHA, 'mirrorIncludeSHA256': sha(shared),
            'sharedIncludeSHA256': SHARED_SHA, 'explicitStaticHeaders': 5,
            'serverHeader': 'HTTPS noindex, nofollow always', 'environment': current_environment}


def preview():
    snapshot = environment()
    before = checked(DIRECT, BEFORE_SHA)
    validate_preview(before, snapshot)
    return {'batch': BATCH, 'state': 'preview-validated', 'productionFilesChanged': False,
            'directSHA256': AFTER_SHA, 'includeSHA256': INCLUDE_SHA}


def swap(expected, replacement, original_attrs):
    if plain(DIRECT) != expected or attrs(DIRECT) != original_attrs:
        raise RuntimeError('Concurrent direct vhost or metadata edit; refusing overwrite')
    atomic(DIRECT, replacement, original_attrs['mode'], (original_attrs['uid'], original_attrs['gid']))


def reload_or_restore(original, candidate, original_attrs):
    try:
        nginx_test()
        nginx_reload()
    except Exception:
        if plain(DIRECT) != candidate or attrs(DIRECT) != original_attrs:
            raise RuntimeError('Concurrent vhost edit; rollback stopped and private backup retained')
        swap(candidate, original, original_attrs)
        nginx_test()
        nginx_reload()
        raise


def apply():
    snapshot = environment()
    before = checked(DIRECT, BEFORE_SHA)
    after = direct_after(before)
    include = mirror_include(checked(SHARED, SHARED_SHA))
    proof = json.loads(plain(PRIVATE / 'preview-verified.json'))
    if proof != {'batch': BATCH, 'directSHA256': AFTER_SHA, 'includeSHA256': INCLUDE_SHA,
                 'environment': snapshot, 'passed': True}:
        raise RuntimeError('Current environment has not passed the exact private preview')
    private_directory()
    original_attrs = attrs(DIRECT)
    immutable(PRIVATE / 'direct.before.conf', before)
    immutable(PRIVATE / 'direct.after.conf', after)
    immutable(PRIVATE / 'direct.metadata.json', (json.dumps(original_attrs, sort_keys=True) + '\n').encode())
    immutable(PRIVATE / 'shared-include.before.conf', checked(SHARED, SHARED_SHA))
    immutable(PRIVATE / 'mirror-include.after.conf', include)
    immutable(INCLUDE, include, 0o644)
    if environment() != snapshot:
        raise RuntimeError('Concurrent environment edit; production vhost left unchanged')
    swap(before, after, original_attrs)
    reload_or_restore(before, after, original_attrs)
    if environment() != snapshot:
        raise RuntimeError('Concurrent environment change after reload; no blind rollback performed')
    checked(DIRECT, AFTER_SHA)
    return {'batch': BATCH, 'state': 'applied', 'directSHA256': AFTER_SHA,
            'includeSHA256': INCLUDE_SHA, 'sharedIncludeSHA256': SHARED_SHA, 'backup': str(PRIVATE)}


def restore():
    environment()
    before = checked(PRIVATE / 'direct.before.conf', BEFORE_SHA)
    after = checked(PRIVATE / 'direct.after.conf', AFTER_SHA)
    if after != direct_after(before):
        raise RuntimeError('Private candidate differs')
    original_attrs = json.loads(plain(PRIVATE / 'direct.metadata.json'))
    if set(original_attrs) != {'mode', 'uid', 'gid'} or any(type(v) is not int or v < 0 for v in original_attrs.values()):
        raise RuntimeError('Invalid original metadata')
    current = plain(DIRECT)
    if current == before and attrs(DIRECT) == original_attrs:
        return {'batch': BATCH, 'state': 'already-restored'}
    if current != after or attrs(DIRECT) != original_attrs:
        raise RuntimeError('Concurrent direct change; restoration stopped')
    checked(INCLUDE, INCLUDE_SHA)
    swap(after, before, original_attrs)
    reload_or_restore(after, before, original_attrs)
    return {'batch': BATCH, 'state': 'restored', 'directSHA256': BEFORE_SHA,
            'unusedMirrorIncludeRetained': str(INCLUDE)}


def self_test():
    """Real filesystem preview/apply/restore, failed reload recovery and drift rejection."""
    import tempfile
    global PRIVATE, DIRECT, ENABLED, CONF_D, NGINX, MAIN, SHARED, FASTCGI, INCLUDE
    global BEFORE_SHA, AFTER_SHA, SHARED_SHA, INCLUDE_SHA, MAIN_SHA, NGINX_SHA, FASTCGI_SHA
    global HTTPS_ANCHOR, SHARED_LINE, SITES_ANCHOR, nginx_test, nginx_reload
    names = ['PRIVATE', 'DIRECT', 'ENABLED', 'CONF_D', 'NGINX', 'MAIN', 'SHARED', 'FASTCGI', 'INCLUDE',
             'BEFORE_SHA', 'AFTER_SHA', 'SHARED_SHA', 'INCLUDE_SHA', 'MAIN_SHA', 'NGINX_SHA', 'FASTCGI_SHA',
             'HTTPS_ANCHOR', 'SHARED_LINE', 'SITES_ANCHOR', 'nginx_test', 'nginx_reload']
    saved = {name: globals()[name] for name in names}
    try:
        with tempfile.TemporaryDirectory(prefix='lolicode-mirror-noindex-') as tmp:
            base = Path(tmp)
            PRIVATE, ENABLED, CONF_D = [base / name for name in ['private', 'enabled', 'conf.d']]
            ENABLED.mkdir()
            CONF_D.mkdir()
            DIRECT, MAIN, NGINX, SHARED, FASTCGI, INCLUDE = [base / name for name in
                ['enabled/direct.conf', 'main.conf', 'nginx.conf', 'forum.conf', 'fastcgi_params', 'mirror.conf']]
            before = HTTPS_ANCHOR + SHARED_LINE + b'\nMAINTENANCE AND OTHER RULES\n'
            shared = b''.join(b'location /' + str(i).encode() + b' {\n  add_header Cache-Control "keep";\n}\n' for i in range(5))
            BEFORE_SHA, SHARED_SHA = sha(before), sha(shared)
            comment = (b'# Mirror-only snapshot of /var/www/forum/.nginx.conf.\n# Source SHA256: ' + SHARED_SHA.encode()
                       + b'\n# Regenerate this snapshot whenever the shared include changes.\n')
            expected_include = comment + shared.replace(b'  add_header Cache-Control "keep";\n',
                                                       b'  add_header Cache-Control "keep";\n  ' + HEADER + b'\n')
            after = before.replace(HTTPS_ANCHOR, HTTPS_ANCHOR + b'    ' + HEADER + b'\n').replace(
                SHARED_LINE, ('    include ' + INCLUDE.as_posix() + ';').encode())
            AFTER_SHA, INCLUDE_SHA = sha(after), sha(expected_include)
            for path, data in [(DIRECT, before), (MAIN, b'main unchanged'), (NGINX, SITES_ANCHOR + b'\ninclude fastcgi_params;\n'),
                               (SHARED, shared), (FASTCGI, b'fastcgi unchanged')]:
                atomic(path, data, 0o644)
            MAIN_SHA, NGINX_SHA, FASTCGI_SHA = [sha(plain(p)) for p in [MAIN, NGINX, FASTCGI]]
            validations, reloads = [], []
            def fake_test(config=None):
                if config is not None:
                    contents = plain(config)
                    assert (PRIVATE / 'mirror-preview-direct.conf').as_posix().encode() in contents
                    assert SITES_ANCHOR not in contents
                    assert plain(PRIVATE / 'fastcgi_params') == plain(FASTCGI)
                validations.append(config)
            nginx_test = fake_test
            nginx_reload = lambda: reloads.append(1)
            assert check()['state'] == 'ready' and not PRIVATE.exists()
            assert preview()['state'] == 'preview-validated' and plain(DIRECT) == before
            assert apply()['state'] == 'applied' and plain(DIRECT) == after
            assert plain(INCLUDE) == expected_include and plain(SHARED) == shared
            assert check()['state'] == 'already-applied'
            assert restore()['state'] == 'restored' and plain(DIRECT) == before
            assert restore()['state'] == 'already-restored'
            attempts = []
            def fail_once():
                attempts.append(1)
                if len(attempts) == 1:
                    raise RuntimeError('injected reload failure')
            nginx_reload = fail_once
            try:
                apply()
                raise AssertionError('Reload failure ignored')
            except RuntimeError:
                assert plain(DIRECT) == before and len(attempts) == 2
            def change_then_fail():
                atomic(DIRECT, b'concurrent operator edit', 0o644)
                raise RuntimeError('injected concurrent reload failure')
            nginx_reload = change_then_fail
            try:
                apply()
                raise AssertionError('Concurrent edit ignored')
            except RuntimeError:
                assert plain(DIRECT) == b'concurrent operator edit'
            atomic(DIRECT, before, 0o644)
            atomic(SHARED, b'new forum security rules', 0o644)
            try:
                check()
                raise AssertionError('Shared include drift ignored')
            except RuntimeError as error:
                assert 'DRIFT' in str(error) and plain(DIRECT) == before
        print(json.dumps({'state': 'self-test-passed', 'checks': 10}))
    finally:
        for name, value in saved.items():
            globals()[name] = value


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        actions = {'check': check, 'preview': preview, 'apply': apply, 'restore': restore}
        if not hasattr(os, 'geteuid') or os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in actions:
            raise RuntimeError('Expected check/preview/apply/restore as root')
        if sys.argv[1] == 'check':
            output = check()
        else:
            with maintenance_lock():
                output = actions[sys.argv[1]]()
        print(json.dumps(output, indent=2))
