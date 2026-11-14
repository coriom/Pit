#!/usr/bin/env python3
"""Validate one PIT V2 backup by restoring into a separate disposable database."""
import hmac
from importlib.util import module_from_spec, spec_from_file_location
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

spec = spec_from_file_location('pit_v2_backup', Path(__file__).with_name('pit-v2-backup.py'))
backup = module_from_spec(spec)
spec.loader.exec_module(backup)


def check(filename, local):
    container, root = backup.target(local)
    backup.inspect(container, local)
    if not backup.NAME.fullmatch(filename):
        raise RuntimeError('ARCHIVE_NAME_INVALID')
    archive = root / filename
    sidecar = archive.with_suffix('.sha256')
    if archive.is_symlink() or sidecar.is_symlink() or not archive.is_file() or not sidecar.is_file():
        raise RuntimeError('ARCHIVE_MISSING_OR_SYMLINK')
    expected_uid = os.geteuid() if local else 0
    if (stat.S_IMODE(root.stat().st_mode) != 0o700 or root.stat().st_uid != expected_uid or
            any(stat.S_IMODE(p.stat().st_mode) != 0o600 or p.stat().st_uid != expected_uid
                for p in (archive, sidecar))):
        raise RuntimeError('ARCHIVE_PERMISSIONS')
    expected = sidecar.read_text(encoding='ascii').strip()
    if not re.fullmatch(r'[0-9a-f]{64}  '+re.escape(filename), expected):
        raise RuntimeError('CHECKSUM_SIDECAR_INVALID')
    if not hmac.compare_digest(expected[:64], backup.digest(archive)):
        raise RuntimeError('ARCHIVE_CHECKSUM_MISMATCH')
    backup.verify_archive(container, archive)
    probe = 'pit_v2_restore_probe_' + os.urandom(4).hex()
    created = False
    try:
        backup.run(['docker', 'exec', '-u', 'postgres', container, 'createdb', '-U', backup.ADMIN, '-T', 'template0', probe])
        created = True
        with archive.open('rb') as source:
            backup.run(['docker', 'exec', '-i', '-u', 'postgres', container, 'pg_restore',
                        '--exit-on-error', '--no-owner', '--no-acl', '-U', backup.ADMIN, '-d', probe],
                       stdin=source, timeout=300)
        query = ("SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN "
                 "('pit_jobs','pit_monitors','pit_alerts','pit_deliveries','pit_worker_heartbeat','pit_edge_nonces'))=6 "
                 "AND EXISTS (SELECT 1 FROM information_schema.columns "
                 "WHERE table_name='pit_jobs' AND column_name='next_attempt_at')")
        valid = backup.run(['docker', 'exec', '-u', 'postgres', container, 'psql', '-X', '-Atq',
                            '-U', backup.ADMIN, '-d', probe, '-c', query]).strip()
        if valid != b't':
            raise RuntimeError('RESTORED_SCHEMA_INVALID')
        if local:
            fixture = backup.run(['docker', 'exec', '-u', 'postgres', container, 'psql', '-X', '-Atq',
                                  '-U', backup.ADMIN, '-d', probe, '-c',
                                  "SELECT (SELECT count(*) FROM pit_jobs WHERE id='11111111-1111-4111-8111-111111111111')=1 "
                                  "AND (SELECT count(*) FROM pit_monitors WHERE id='22222222-2222-4222-8222-222222222222')=1 "
                                  "AND (SELECT count(*) FROM pit_alerts WHERE id='33333333-3333-4333-8333-333333333333')=1"] ).strip()
            if fixture != b't':
                raise RuntimeError('RESTORED_FIXTURE_MISSING')
        print('PIT_V2_RESTORE_PASS disposable_database schema data_checksum')
    finally:
        if created:
            backup.run(['docker', 'exec', '-u', 'postgres', container, 'dropdb', '--if-exists',
                        '--force', '-U', backup.ADMIN, probe])


if __name__ == '__main__':
    try:
        args = sys.argv[1:]
        local = args[:1] == ['--local-test']
        filename = args[1] if local and len(args) == 2 else args[0] if not local and len(args) == 1 else ''
        if not filename:
            raise RuntimeError('ARGUMENTS_INVALID')
        check(filename, local)
    except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError, KeyError) as error:
        print(f'PIT_V2_RESTORE_FAIL code={str(error).split()[0]}', file=sys.stderr)
        sys.exit(1)
