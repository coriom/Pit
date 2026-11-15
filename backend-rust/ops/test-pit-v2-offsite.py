#!/usr/bin/env python3
"""Local-only GPG, object readback and disposable PostgreSQL restore rehearsal."""
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
from unittest.mock import patch

HERE = Path(__file__).parent


def module(filename, name):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    instance = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(instance)
    return instance


offsite = module('pit-v2-offsite.py', 'pit_v2_offsite_test')
recovery = module('pit-v2-offsite-recover.py', 'pit_v2_recovery_test')


def run(args, *, env=None, input=None):
    p = subprocess.run(args, env=env, input=input, capture_output=True, timeout=120)
    if p.returncode:
        raise RuntimeError('FIXTURE_COMMAND_FAILED_' + Path(args[0]).name + ': ' +
                           p.stderr.decode(errors='replace')[-800:])
    return p.stdout


class LocalStore:
    def __init__(self, root):
        self.root = root

    def used(self):
        return sum(p.stat().st_size for p in self.root.rglob('*') if p.is_file())

    def put(self, source, key):
        target = self.root / key
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raise RuntimeError('IMMUTABLE_OBJECT_EXISTS')
        shutil.copyfile(source, target)

    def get(self, key, target):
        shutil.copyfile(self.root / key, target)


def fixture():
    with tempfile.TemporaryDirectory(prefix='pit-v27-offsite-test-') as location:
        base = Path(location)
        data, socket, backups, settings, objects = (base / name for name in
                                                    ('data', 'socket', 'backups', 'settings', 'objects'))
        for path in (socket, backups, settings, objects):
            path.mkdir(mode=0o700)
        private = base / 'offline-private-key'
        private.mkdir(mode=0o700)
        port = str(54000 + secrets.randbelow(10000))
        env = dict(os.environ, PGHOST=str(socket), PGPORT=port, PGUSER=os.getlogin()
                   if os.isatty(0) else os.environ.get('USER', 'corio'))
        pg_bin = Path('/usr/lib/postgresql/16/bin')
        run([str(pg_bin / 'initdb'), '--auth=trust', '--username=' + env['PGUSER'], '-D', str(data)])
        running = False
        try:
            try:
                run([str(pg_bin / 'pg_ctl'), '-D', str(data), '-l', str(base / 'postgres.log'),
                     '-o', f'-k {socket} -p {port} -c listen_addresses=', 'start'])
            except RuntimeError as error:
                raise RuntimeError(str(error) + ' ' +
                                   (base / 'postgres.log').read_text(errors='replace')[-800:]) from error
            running = True
            run(['createdb', 'pit_v27_fixture'], env=env)
            for migration in ('backend/migrations/001_init.sql',
                              'backend/migrations/002_edge_nonces.sql',
                              'backend-rust/migrations/003_retry_schedule.sql'):
                run(['psql', '-X', '-q', '-d', 'pit_v27_fixture', '-f', str(HERE.parents[1] / migration)], env=env)
            sql = """INSERT INTO pit_jobs(id,kind,access_hash,invite_hash,input_json,status)
              VALUES('11111111-1111-4111-8111-111111111111','events','a','b','{}','COMPLETED');
              INSERT INTO pit_monitors(id,access_hash,invite_hash,chain,contract,rule_json,cursor_block,expires_at)
              VALUES('22222222-2222-4222-8222-222222222222','a','b','base-sepolia','0x0','{}',1,now()+interval '1 day');
              INSERT INTO pit_alerts(id,monitor_id,chain_id,block_hash,block_number,transaction_hash,log_index,event_json)
              VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',84532,'0x1',1,'0x2',0,'{}');"""
            run(['psql', '-X', '-q', '-d', 'pit_v27_fixture', '-c', sql], env=env)
            archive = backups / 'pit-v2-20261115T033000Z-12345678.dump'
            run(['pg_dump', '-Fc', '--no-owner', '--no-acl', '-f', str(archive), 'pit_v27_fixture'], env=env)
            archive.chmod(0o600)
            sidecar = archive.with_suffix('.sha256')
            sidecar.write_text(f'{offsite.sha256(archive)}  {archive.name}\n', encoding='ascii')
            sidecar.chmod(0o600)

            run(['gpg', '--homedir', str(private), '--batch', '--pinentry-mode', 'loopback',
                 '--passphrase', '', '--quick-generate-key', 'PIT fixture <pit@example.invalid>',
                 'rsa3072', 'encr', '1d'])
            listing = run(['gpg', '--homedir', str(private), '--batch', '--with-colons',
                           '--fingerprint', '--list-keys']).decode('ascii')
            fingerprint = next(line.split(':')[9] for line in listing.splitlines() if line.startswith('fpr:'))
            public = run(['gpg', '--homedir', str(private), '--batch', '--armor', '--export', fingerprint])
            (settings / 'recipient.asc').write_bytes(public)
            (settings / 'config.json').write_text(json.dumps({
                'account_id': 'a' * 32, 'recipient_fingerprint': fingerprint,
                'retention_days': 7}), encoding='ascii')
            (settings / 'rclone.conf').write_text(
                '[pit_v2_r2]\ntype = s3\nprovider = Cloudflare\nregion = auto\n'
                'acl = private\nno_check_bucket = true\n'
                'endpoint = https://' + 'a' * 32 + '.r2.cloudflarestorage.com\n'
                'access_key_id = fixture-only\nsecret_access_key = fixture-only\n', encoding='ascii')
            for path in settings.iterdir():
                path.chmod(0o600)
            store = LocalStore(objects)
            offsite.upload(backups, settings, store, uid=os.geteuid(), dump=archive)
            stored = [p for p in objects.rglob('*') if p.is_file()]
            assert len(stored) == 2 and all(p.suffix in ('.gpg', '.json') for p in stored)
            cipher = next(p for p in stored if p.suffix == '.gpg')
            manifest = Path(str(cipher) + '.json')
            with patch.dict(os.environ, {'PGHOST': str(socket), 'PGPORT': port,
                                          'PGUSER': env['PGUSER']}):
                recovery.recover(cipher, manifest, private)
            assert not run(['psql', '-X', '-Atq', '-d', 'postgres', '-c',
                            "SELECT datname FROM pg_database WHERE datname LIKE 'pit_v2_offsite_restore_%'"],
                           env=env).strip()
            corrupted = base / cipher.name
            payload = bytearray(cipher.read_bytes())
            payload[len(payload) // 2] ^= 1
            corrupted.write_bytes(payload)
            try:
                with patch.dict(os.environ, {'PGHOST': str(socket), 'PGPORT': port,
                                              'PGUSER': env['PGUSER']}):
                    recovery.recover(corrupted, manifest, private)
                raise AssertionError('TAMPER_ACCEPTED')
            except recovery.offsite.CheckFailed as error:
                assert str(error) == 'CIPHERTEXT_INTEGRITY'
            class FullStore(LocalStore):
                def used(self):
                    return offsite.MAX_REMOTE

                def put(self, source, key):
                    raise AssertionError('UPLOAD_PAST_STORAGE_CAP')

            try:
                offsite.upload(backups, settings, FullStore(objects), uid=os.geteuid(), dump=archive)
                raise AssertionError('STORAGE_CAP_BYPASSED')
            except offsite.CheckFailed as error:
                assert str(error) == 'REMOTE_8_GIB_CAP'
            sidecar.write_text('0' * 64 + '  ' + archive.name + '\n', encoding='ascii')
            try:
                offsite.upload(backups, settings, store, uid=os.geteuid(), dump=archive)
                raise AssertionError('BAD_SOURCE_CHECKSUM_ACCEPTED')
            except offsite.CheckFailed as error:
                assert str(error) == 'ARCHIVE_SHA256'
            print('PIT_V27_OFFSITE_LOCAL_FIXTURE_PASS encrypted_only readback tamper_denial disposable_restore storage_cap source_checksum_denial')
        finally:
            if running:
                run([str(pg_bin / 'pg_ctl'), '-D', str(data), '-m', 'immediate', 'stop'])


if __name__ == '__main__':
    fixture()
