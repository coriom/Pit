#!/usr/bin/env python3
"""Verify and restore an R2-downloaded age ciphertext on a separate machine."""
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location('pit_offsite', Path(__file__).with_name('pit-v2-offsite.py'))
offsite = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offsite)


def run(args, env):
    result = subprocess.run(args, capture_output=True, env=env, timeout=300)
    offsite.check(result.returncode == 0, 'COMMAND_' + Path(args[0]).name)
    return result.stdout


def recover(cipher, manifest, identity):
    cipher, manifest, identity = map(Path, (cipher, manifest, identity))
    offsite.check(cipher.is_file() and not cipher.is_symlink() and manifest.is_file() and
                  not manifest.is_symlink() and manifest.stat().st_size <= 4096 and
                  cipher.stat().st_size <= offsite.MAX_DUMP + 1024 * 1024, 'DOWNLOAD_FILES')
    meta = json.loads(manifest.read_text(encoding='ascii'))
    offsite.check(set(meta) == {'schema', 'archive', 'plaintext_sha256', 'ciphertext_sha256',
                                'ciphertext_bytes', 'recipient_sha256'} and
                  meta['schema'] == 'pit.v2.offsite.age.v1' and
                  isinstance(meta['archive'], str) and offsite.ARCHIVE.fullmatch(meta['archive']) and
                  cipher.name == meta['archive'] + '.age' and
                  isinstance(meta['recipient_sha256'], str) and
                  re.fullmatch(r'[a-f0-9]{64}', meta['recipient_sha256']) and
                  isinstance(meta['plaintext_sha256'], str) and
                  re.fullmatch(r'[a-f0-9]{64}', meta['plaintext_sha256']) and
                  isinstance(meta['ciphertext_sha256'], str) and
                  re.fullmatch(r'[a-f0-9]{64}', meta['ciphertext_sha256']) and
                  meta['ciphertext_bytes'] == cipher.stat().st_size and
                  offsite.sha256(cipher) == meta['ciphertext_sha256'], 'CIPHERTEXT_INTEGRITY')
    offsite.check(identity.is_file() and not identity.is_symlink() and
                  identity.stat().st_size <= 4096 and identity.stat().st_mode & 0o077 == 0,
                  'RECOVERY_KEY_FILE')
    pg_host = os.environ.get('PGHOST', '')
    pg_port = os.environ.get('PGPORT', '5432')
    pg_user = os.environ.get('PGUSER', '')
    offsite.check(pg_host.startswith('/') and pg_port.isdecimal() and
                  1 <= int(pg_port) <= 65535 and re.fullmatch(r'[a-z_][a-z0-9_]*', pg_user),
                  'LOCAL_POSTGRES_SOCKET_REQUIRED')
    env = {'PATH': '/usr/sbin:/usr/bin:/bin', 'PGHOST': pg_host,
           'PGPORT': pg_port, 'PGUSER': pg_user, 'PGDATABASE': 'postgres'}
    recipient = run(['age-keygen', '-y', str(identity)], env).strip()
    offsite.check(offsite.RECIPIENT.fullmatch(recipient.decode('ascii')) and
                  offsite.hashlib.sha256(recipient).hexdigest() == meta['recipient_sha256'],
                  'RECOVERY_RECIPIENT_MISMATCH')
    with tempfile.TemporaryDirectory(prefix='pit-v2-recover-') as temp:
        dump = Path(temp) / meta['archive']
        run(['age', '--decrypt', '--identity', str(identity), '--output', str(dump), str(cipher)], env)
        offsite.check(offsite.sha256(dump) == meta['plaintext_sha256'], 'PLAINTEXT_INTEGRITY')
        listing = run(['pg_restore', '--list', str(dump)], env)
        offsite.check(all(table in listing for table in (b'pit_jobs', b'pit_monitors',
                      b'pit_alerts', b'pit_edge_nonces')), 'ARCHIVE_SCHEMA')
        db = 'pit_v2_offsite_restore_' + secrets.token_hex(4)
        created = False
        try:
            run(['createdb', '--template=template0', db], env)
            created = True
            run(['pg_restore', '--exit-on-error', '--no-owner', '--no-acl',
                 '--dbname=' + db, str(dump)], env)
            sql = ("SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND "
                   "tablename IN ('pit_jobs','pit_monitors','pit_alerts','pit_deliveries',"
                   "'pit_worker_heartbeat','pit_edge_nonces'))=6 AND "
                   "EXISTS (SELECT 1 FROM information_schema.columns WHERE "
                   "table_name='pit_jobs' AND column_name='next_attempt_at')")
            offsite.check(run(['psql', '-X', '-Atq', '-d', db, '-c', sql], env).strip() == b't',
                          'RESTORED_SCHEMA')
            counts = run(['psql', '-X', '-Atq', '-d', db, '-c',
                          'SELECT (SELECT count(*) FROM pit_jobs),'
                          '(SELECT count(*) FROM pit_monitors),'
                          '(SELECT count(*) FROM pit_alerts)'], env).strip()
            offsite.check(re.fullmatch(rb'\d+\|\d+\|\d+', counts), 'RESTORED_DATA')
            print('PIT_V2_OFFSITE_RESTORE_PASS disposable_database schema jobs_monitors_alerts=' +
                  counts.decode('ascii'))
        finally:
            if created:
                run(['dropdb', '--if-exists', '--force', db], env)


if __name__ == '__main__':
    os.umask(0o077)
    try:
        offsite.check(len(sys.argv) == 4, 'ARGUMENTS')
        recover(*sys.argv[1:])
    except (offsite.CheckFailed, OSError, ValueError, TypeError, KeyError,
            subprocess.TimeoutExpired) as error:
        code = str(error).split()[0] if isinstance(error, offsite.CheckFailed) else type(error).__name__
        print('PIT_V2_OFFSITE_RESTORE_FAIL code=' + code, file=sys.stderr)
        raise SystemExit(1)
