#!/usr/bin/env python3
"""PIT V2-only age-encrypted offsite transfer. Activation requires separate approval."""
import configparser
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time

BACKUPS = Path('/var/backups/pit-v2')
CONFIG = Path('/etc/pit-v2-offsite')
BUCKET = 'pit-v2-backups'
REMOTE = 'pit_v2_r2'
PREFIX = 'pit-v2/'
MAX_DUMP = 1024 ** 3
MAX_REMOTE = 8 * 1024 ** 3
ARCHIVE = re.compile(r'pit-v2-\d{8}T\d{6}Z-[0-9a-f]{8}\.dump')
RECIPIENT = re.compile(r'age1[0-9a-z]{58}')


class CheckFailed(Exception):
    pass


def check(condition, code):
    if not condition:
        raise CheckFailed(code)


def command(args, *, env=None, timeout=300):
    result = subprocess.run(args, capture_output=True, env=env, timeout=timeout)
    check(result.returncode == 0, 'COMMAND_' + Path(args[0]).name)
    return result.stdout


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def private_file(path, uid):
    p = Path(path)
    check(p.is_file() and not p.is_symlink(), 'FILE_ABSENT_OR_LINK')
    s = p.stat()
    check(s.st_uid == uid and stat.S_IMODE(s.st_mode) == 0o600, 'FILE_MODE')


def private_dir(path, uid):
    p = Path(path)
    check(p.is_dir() and not p.is_symlink(), 'DIRECTORY_ABSENT_OR_LINK')
    s = p.stat()
    check(s.st_uid == uid and stat.S_IMODE(s.st_mode) == 0o700, 'DIRECTORY_MODE')


def verified_dump(root, path, uid):
    private_dir(root, uid)
    path = Path(path)
    check(path.parent == Path(root) and ARCHIVE.fullmatch(path.name), 'ARCHIVE_PATH')
    private_file(path, uid)
    check(0 < path.stat().st_size <= MAX_DUMP, 'ARCHIVE_SIZE')
    sidecar = path.with_suffix('.sha256')
    private_file(sidecar, uid)
    check(sidecar.read_text(encoding='ascii').strip() == f'{sha256(path)}  {path.name}',
          'ARCHIVE_SHA256')
    return path


def latest_dump(root):
    paths = sorted(p for p in Path(root).iterdir() if ARCHIVE.fullmatch(p.name) and p.is_file())
    check(bool(paths), 'ARCHIVE_ABSENT')
    check(-120 <= time.time() - paths[-1].stat().st_mtime <= 3600, 'ARCHIVE_STALE')
    return paths[-1]


def config_check(root, uid):
    private_dir(root, uid)
    for name in ('config.json', 'recipient.txt', 'rclone.conf'):
        private_file(Path(root) / name, uid)
    check((Path(root) / 'config.json').stat().st_size <= 4096 and
          (Path(root) / 'rclone.conf').stat().st_size <= 4096 and
          (Path(root) / 'recipient.txt').stat().st_size <= 128, 'CONFIG_SIZE')
    cfg = json.loads((Path(root) / 'config.json').read_text(encoding='ascii'))
    check(set(cfg) == {'account_id', 'recipient_sha256', 'retention_days'} and
          isinstance(cfg['account_id'], str) and re.fullmatch(r'[a-f0-9]{32}', cfg['account_id']) and
          isinstance(cfg['recipient_sha256'], str) and
          re.fullmatch(r'[a-f0-9]{64}', cfg['recipient_sha256']) and
          cfg['retention_days'] == 7, 'OFFSITE_CONFIG')
    recipient_text = (Path(root) / 'recipient.txt').read_text(encoding='ascii')
    recipient = recipient_text.removesuffix('\n')
    check(RECIPIENT.fullmatch(recipient) and recipient_text in (recipient, recipient + '\n') and
          hashlib.sha256(recipient.encode('ascii')).hexdigest() == cfg['recipient_sha256'],
          'RECIPIENT_HASH')
    parser = configparser.RawConfigParser()
    check(bool(parser.read(Path(root) / 'rclone.conf')) and parser.sections() == [REMOTE],
          'RCLONE_CONFIG')
    remote = parser[REMOTE]
    check(set(remote) == {'type', 'provider', 'region', 'acl', 'no_check_bucket',
                          'endpoint', 'access_key_id', 'secret_access_key'} and
          remote.get('type') == 's3' and remote.get('provider') == 'Cloudflare' and
          remote.get('region') == 'auto' and remote.get('acl') == 'private' and
          remote.get('no_check_bucket') == 'true' and
          remote.get('endpoint') == f'https://{cfg["account_id"]}.r2.cloudflarestorage.com' and
          bool(remote.get('access_key_id')) and bool(remote.get('secret_access_key')),
          'RCLONE_DESTINATION')
    return cfg, recipient


def encrypt(dump, recipient, output):
    check(RECIPIENT.fullmatch(recipient), 'RECIPIENT')
    command(['age', '--encrypt', '--recipient', recipient, '--output', str(output), str(dump)],
            env={'PATH': '/usr/sbin:/usr/bin:/bin', 'HOME': '/var/backups/pit-v2'})
    os.chmod(output, 0o600)
    check(output.stat().st_size > 0, 'ENCRYPTION_EMPTY')


def object_key(dump):
    stamp = dump.name[7:15]
    return f'{PREFIX}{stamp[:4]}/{stamp[4:6]}/{dump.name}.age'


class Rclone:
    def __init__(self, cfg):
        self.cfg = Path(cfg)

    def call(self, *args):
        return command(['rclone', '--config', str(self.cfg), '--transfers', '1', '--checkers', '1',
                        '--retries', '2', '--low-level-retries', '2', '--timeout', '30s', *args],
                       env={'PATH': '/usr/sbin:/usr/bin:/bin', 'HOME': '/var/backups/pit-v2'})

    def remote(self, key):
        check(key.startswith(PREFIX) and '..' not in key, 'REMOTE_KEY')
        return f'{REMOTE}:{BUCKET}/{key}'

    def used(self):
        files = json.loads(self.call('lsjson', '--recursive', '--files-only',
                                     f'{REMOTE}:{BUCKET}/{PREFIX}'))
        check(len(files) <= 1000 and all(isinstance(f.get('Size'), int) and f['Size'] >= 0
                                         for f in files), 'REMOTE_INVENTORY')
        return sum(f['Size'] for f in files)

    def put(self, source, key):
        self.call('copyto', '--immutable', str(source), self.remote(key))

    def get(self, key, target):
        self.call('copyto', self.remote(key), str(target))


def upload(root=BACKUPS, settings=CONFIG, store=None, *, uid=0, dump=None):
    root, settings = Path(root), Path(settings)
    cfg, recipient = config_check(settings, uid)
    dump = verified_dump(root, dump or latest_dump(root), uid)
    store = store or Rclone(settings / 'rclone.conf')
    key = object_key(dump)
    lock_path = root / '.offsite.lock'
    check(not lock_path.is_symlink(), 'LOCK_SYMLINK')
    with lock_path.open('a+b') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix='.offsite-', dir=root) as temp:
            work = Path(temp)
            cipher = work / (dump.name + '.age')
            encrypt(dump, recipient, cipher)
            meta = {'schema': 'pit.v2.offsite.age.v1', 'archive': dump.name,
                    'plaintext_sha256': sha256(dump), 'ciphertext_sha256': sha256(cipher),
                    'ciphertext_bytes': cipher.stat().st_size,
                    'recipient_sha256': cfg['recipient_sha256']}
            manifest = work / (cipher.name + '.json')
            manifest.write_text(json.dumps(meta, sort_keys=True, separators=(',', ':')) + '\n', encoding='ascii')
            os.chmod(manifest, 0o600)
            check(store.used() + cipher.stat().st_size + manifest.stat().st_size <= MAX_REMOTE,
                  'REMOTE_8_GIB_CAP')
            store.put(cipher, key)
            readback = work / 'readback.age'
            store.get(key, readback)
            check(sha256(readback) == meta['ciphertext_sha256'], 'CIPHER_READBACK')
            store.put(manifest, key + '.json')
            meta_readback = work / 'readback.json'
            store.get(key + '.json', meta_readback)
            check(meta_readback.read_bytes() == manifest.read_bytes(), 'MANIFEST_READBACK')
            print(f'PIT_V2_OFFSITE_UPLOAD_PASS object={key} bytes={cipher.stat().st_size} sha256={meta["ciphertext_sha256"]}')


if __name__ == '__main__':
    os.umask(0o077)
    try:
        check(os.geteuid() == 0, 'ARGUMENTS_OR_PRIVILEGE')
        if sys.argv[1:] == ['--upload-latest']:
            upload()
        elif len(sys.argv) == 3 and sys.argv[1] == '--upload-archive' and ARCHIVE.fullmatch(sys.argv[2]):
            # One approved transfer may use an older, already verified scheduled dump.
            upload(dump=BACKUPS / sys.argv[2])
        else:
            raise CheckFailed('ARGUMENTS_OR_PRIVILEGE')
    except (CheckFailed, OSError, ValueError, TypeError, KeyError,
            BlockingIOError, subprocess.TimeoutExpired) as error:
        code = str(error).split()[0] if isinstance(error, CheckFailed) else type(error).__name__
        print('PIT_V2_OFFSITE_FAIL code=' + code, file=sys.stderr)
        raise SystemExit(1)
