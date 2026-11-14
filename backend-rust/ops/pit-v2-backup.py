#!/usr/bin/env python3
"""PIT V2-only PostgreSQL custom dump; no secret values or database rows are logged."""
import hashlib
import json
import fcntl
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
from datetime import datetime, timezone

PROJECT = 'pit-crypto-v2-canary'
SERVICE = 'pit-v2-db'
CONTAINER = f'{PROJECT}-{SERVICE}-1'
VOLUME = f'{PROJECT}_pit-v2-db-data'
DATA_NETWORK = f'{PROJECT}_pit-v2-data'
DB = 'pit_crypto_v2'
ROLE = 'pit_v2_backup'
PROD_ROOT = Path('/var/backups/pit-v2')
MAX_ARCHIVE_BYTES = 1024 ** 3
MAX_STORE_BYTES = 4 * 1024 ** 3
KEEP = 7
NAME = re.compile(r'^pit-v2-\d{8}T\d{6}Z-[0-9a-f]{8}\.dump$')


def run(args, *, stdin=None, stdout=None, timeout=120):
    result = subprocess.run(args, stdin=stdin, stdout=stdout or subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError(f'COMMAND_FAILED_{args[0]}_{result.returncode}')
    return result.stdout


def target(local):
    if local:
        root = Path(os.environ.get('PIT_V2_TEST_BACKUP_ROOT', ''))
        if root.resolve().parent != Path('/tmp') or not root.name.startswith('pit-v25-backup-test-'):
            raise RuntimeError('TEST_ROOT_INVALID')
        return 'pit-v25-local-db', root
    if os.geteuid() != 0:
        raise RuntimeError('ROOT_REQUIRED_FOR_DOCKER_SOCKET')
    return CONTAINER, PROD_ROOT


def inspect(container, local):
    info = json.loads(run(['docker', 'inspect', container]))[0]
    if info['State']['Status'] != 'running' or (not local and info['State'].get('Health', {}).get('Status') != 'healthy'):
        raise RuntimeError('PIT_DB_NOT_HEALTHY')
    if local:
        if info['Config']['Labels'].get('pit.v25.backup-fixture') != 'true':
            raise RuntimeError('TEST_CONTAINER_IDENTITY_CHANGED')
    else:
        labels = info['Config']['Labels']
        if labels.get('com.docker.compose.project') != PROJECT or labels.get('com.docker.compose.service') != SERVICE:
            raise RuntimeError('PIT_COMPOSE_IDENTITY_CHANGED')
        mounts = info['Mounts']
        if len(mounts) != 1 or mounts[0].get('Name') != VOLUME or mounts[0].get('Destination') != '/var/lib/postgresql/data':
            raise RuntimeError('PIT_DB_VOLUME_CHANGED')
        if set(info['NetworkSettings']['Networks']) != {DATA_NETWORK}:
            raise RuntimeError('PIT_DB_NETWORK_CHANGED')
        if info['NetworkSettings']['Ports'] and any(info['NetworkSettings']['Ports'].values()):
            raise RuntimeError('PIT_DB_PUBLIC_PORT')


def safe_root(root, local):
    if root.is_symlink():
        raise RuntimeError('BACKUP_ROOT_SYMLINK')
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    meta = root.stat()
    if not stat.S_ISDIR(meta.st_mode) or stat.S_IMODE(meta.st_mode) != 0o700 or meta.st_uid != (os.geteuid() if local else 0):
        raise RuntimeError('BACKUP_ROOT_PERMISSIONS')


def verify_role(container):
    query = "SELECT rolcanlogin AND NOT rolsuper AND pg_has_role('pit_v2_backup','pg_read_all_data','member') FROM pg_roles WHERE rolname='pit_v2_backup'"
    output = run(['docker', 'exec', '-u', 'postgres', container, 'psql', '-X', '-Atq', '-U', 'postgres', '-d', DB, '-c', query])
    if output.strip() != b't':
        raise RuntimeError('BACKUP_ROLE_NOT_READY')


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def verify_archive(container, path):
    with path.open('rb') as archive:
        listing = run(['docker', 'exec', '-i', '-u', 'postgres', container, 'pg_restore', '--list'],
                      stdin=archive, timeout=120)
    if b'pit_jobs' not in listing or b'pit_monitors' not in listing or b'pit_edge_nonces' not in listing:
        raise RuntimeError('ARCHIVE_SCHEMA_INCOMPLETE')


def rotate(root):
    archives = sorted((p for p in root.iterdir() if NAME.fullmatch(p.name) and p.is_file() and not p.is_symlink()),
                      key=lambda p: p.name, reverse=True)
    retained = []
    total = 0
    for archive in archives:
        size = archive.stat().st_size
        if not retained or (len(retained) < KEEP and total + size <= MAX_STORE_BYTES):
            retained.append(archive)
            total += size
            continue
        archive.unlink()
        archive.with_suffix('.sha256').unlink(missing_ok=True)
    if total > MAX_STORE_BYTES:
        raise RuntimeError('BACKUP_STORE_LIMIT')


def backup(local):
    container, root = target(local)
    inspect(container, local)
    verify_role(container)
    safe_root(root, local)
    lock_path = root / '.backup.lock'
    with lock_path.open('a+b') as lock:
        os.chmod(lock_path, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('BACKUP_ALREADY_RUNNING') from error
        create_archive(container, root)


def create_archive(container, root):
    size = int(run(['docker', 'exec', '-u', 'postgres', container, 'psql', '-X', '-Atq',
                    '-U', 'postgres', '-d', DB, '-c', "SELECT pg_database_size('pit_crypto_v2')"]).strip())
    if size > MAX_ARCHIVE_BYTES:
        raise RuntimeError('DATABASE_SIZE_LIMIT')
    if shutil.disk_usage(root).free < max(2 * size, 2 * 1024 ** 3):
        raise RuntimeError('DISK_HEADROOM_LOW')
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    name = f'pit-v2-{timestamp}-{os.urandom(4).hex()}.dump'
    archive = root / name
    partial = root / f'.{name}.partial'
    try:
        with partial.open('xb') as output:
            os.chmod(partial, 0o600)
            run(['docker', 'exec', '-u', 'postgres', container, 'pg_dump', '-Fc', '--no-owner',
                 '--no-acl', '-U', ROLE, '-d', DB], stdout=output, timeout=300)
        if partial.stat().st_size == 0 or partial.stat().st_size > MAX_ARCHIVE_BYTES:
            raise RuntimeError('ARCHIVE_SIZE_LIMIT')
        verify_archive(container, partial)
        checksum = digest(partial)
        os.link(partial, archive)
        partial.unlink()
        sidecar = archive.with_suffix('.sha256')
        sidecar.write_text(f'{checksum}  {archive.name}\n', encoding='ascii')
        os.chmod(sidecar, 0o600)
        rotate(root)
        print(f'PIT_V2_BACKUP_PASS archive={archive.name} bytes={archive.stat().st_size} sha256={checksum}')
    finally:
        partial.unlink(missing_ok=True)


if __name__ == '__main__':
    os.umask(0o077)
    try:
        if sys.argv[1:] == ['--local-test']:
            backup(True)
        elif not sys.argv[1:]:
            backup(False)
        else:
            raise RuntimeError('ARGUMENTS_INVALID')
    except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError, KeyError) as error:
        print(f'PIT_V2_BACKUP_FAIL code={str(error).split()[0]}', file=sys.stderr)
        sys.exit(1)
