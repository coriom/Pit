#!/usr/bin/env python3
"""One bounded, synthetic, read-only PIT V2 hosted job; requires the original invite."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import pwd
import secrets
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

PROJECT = 'pit-crypto-v2-canary'
API = PROJECT + '-pit-v2-api-1'
DB = PROJECT + '-pit-v2-db-1'
DATA = PROJECT + '_pit-v2-data'
PREFIX = '/pit/api/v1'
INVITE = Path('/home/deoptops/.config/pit-v26/invite-test-only')
CONTRACT = '0xF2c716A5EA0240C3D3A49cA1aad81d98e2947475'
BLOCK = 51698212
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def require(value, code):
    if not value:
        raise RuntimeError(code)


def run(*args):
    p = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                       timeout=25, check=False)
    require(p.returncode == 0, 'COMMAND_FAILED_' + args[0])
    return p.stdout.strip()


def request(method, path, key, base, *, body=b'', headers=None, nonce=None, timestamp=None,
            canonical_body=None, signed=True):
    final_headers = dict(headers or {})
    if signed:
        timestamp = timestamp or str(int(time.time() * 1000))
        nonce = nonce or secrets.token_hex(16)
        digest = hashlib.sha256(body if canonical_body is None else canonical_body).hexdigest()
        canonical = f'{timestamp}\n{nonce}\n{method}\n{PREFIX + path}\n{digest}'.encode()
        final_headers.update({
            'x-pit-edge-timestamp': timestamp,
            'x-pit-edge-nonce': nonce,
            'x-pit-edge-signature': hmac.new(key.encode(), canonical, hashlib.sha256).hexdigest(),
        })
    data = body if method in ('POST', 'PUT', 'PATCH') else None
    req = urllib.request.Request(base + PREFIX + path, data=data, method=method, headers=final_headers)
    try:
        with opener.open(req, timeout=18) as response:
            status, payload = response.status, response.read(2_000_000)
    except urllib.error.HTTPError as error:
        status, payload = error.code, error.read(2_000_000)
    try:
        return status, json.loads(payload)
    except (ValueError, UnicodeDecodeError):
        return status, payload.decode('utf-8', errors='replace')


def main():
    require(os.geteuid() == 0, 'ROOT_REQUIRED_FOR_DOCKER_SOCKET')
    require(INVITE.is_file() and not INVITE.is_symlink(), 'ORIGINAL_SYNTHETIC_INVITATION_MISSING')
    owner = pwd.getpwnam('deoptops').pw_uid
    require(INVITE.stat().st_uid == owner and stat.S_IMODE(INVITE.stat().st_mode) == 0o600 and
            INVITE.parent.stat().st_uid == owner and stat.S_IMODE(INVITE.parent.stat().st_mode) == 0o700,
            'INVITATION_FILE_PERMISSIONS')
    record = json.loads(run('docker', 'inspect', API))[0]
    require(record['State']['Status'] == 'running' and record['State']['Health']['Status'] == 'healthy', 'API_UNHEALTHY')
    require(record['Config']['Labels'].get('com.docker.compose.project') == PROJECT, 'API_IDENTITY_CHANGED')
    require(DATA in record['NetworkSettings']['Networks'] and not record['HostConfig'].get('PortBindings'), 'API_NETWORK_CHANGED')
    ip = record['NetworkSettings']['Networks'][DATA]['IPAddress']
    require(ip and ':' not in ip, 'PRIVATE_IPV4_UNAVAILABLE')
    base = f'http://{ip}:8789'
    env = dict(item.split('=', 1) for item in record['Config']['Env'] if '=' in item)
    key = env.get('PIT_EDGE_HMAC_KEY', '')
    invite = INVITE.read_text(encoding='ascii').strip()
    require(len(key) >= 32 and len(invite) >= 32, 'PRIVATE_CREDENTIAL_MISSING')
    require(hmac.compare_digest(hashlib.sha256(invite.encode()).hexdigest(), env.get('PIT_BACKEND_INVITE_SHA256', '')),
            'INVITATION_HASH_MISMATCH')
    require(env.get('PIT_NFT_FETCH_ENABLED') == '0', 'HOSTED_NFT_ENABLED')
    require(request('GET', '/health', key, base, signed=False)[0] == 403, 'UNSIGNED_ORIGIN_ALLOWED')
    require(request('GET', '/health', key, base)[0] == 200 and request('GET', '/ready', key, base)[0] == 200,
            'SIGNED_HEALTH_FAILED')

    unknown = '/jobs/00000000-0000-4000-8000-000000000000'
    stamp, nonce = str(int(time.time() * 1000)), secrets.token_hex(16)
    first = request('GET', unknown, key, base, timestamp=stamp, nonce=nonce)
    replay = request('GET', unknown, key, base, timestamp=stamp, nonce=nonce)
    require(first[0] == 404 and replay[0] == 403 and replay[1].get('code') == 'EDGE_REPLAY_DENIED',
            'NONCE_REPLAY_ALLOWED')
    print('PIT_V26_AUTH_REPLAY_PASS')

    fixture = {'kind': 'events', 'input': {'chain': 'base-sepolia', 'contract': CONTRACT,
                                         'fromBlock': BLOCK, 'toBlock': BLOCK}}
    body = json.dumps(fixture, separators=(',', ':')).encode()
    altered = b'{"kind":"nft","input":{}}'
    headers = {'x-pit-invite': invite, 'idempotency-key': secrets.token_hex(16),
               'content-type': 'application/json'}
    require(request('POST', '/jobs', key, base, body=altered, canonical_body=body, headers=headers)[0] == 403,
            'BODY_INTEGRITY_BYPASS')
    print('PIT_V26_BODY_INTEGRITY_PASS')

    status, created = request('POST', '/jobs', key, base, body=body, headers=headers)
    require(status == 202 and created.get('status') == 'QUEUED' and created.get('id') and created.get('accessToken'),
            'JOB_CREATE_FAILED')
    jid, capability = created['id'], created['accessToken']
    job_path = '/jobs/' + jid
    auth = {'authorization': 'Bearer ' + capability}
    started = time.monotonic()
    try:
        wrong = request('GET', job_path, key, base, headers={'authorization': 'Bearer ' + secrets.token_urlsafe(32)})
        require(wrong[0] == 404, 'CAPABILITY_SCOPE_BYPASS')
        terminal = None
        for _ in range(60):
            code, value = request('GET', job_path, key, base, headers=auth)
            require(code == 200, 'JOB_READ_FAILED')
            if value.get('status') in ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'):
                terminal = value
                break
            time.sleep(2)
        require(terminal and terminal['status'] == 'COMPLETED', 'JOB_NOT_COMPLETED')
        result = terminal.get('result') or {}
        require(result.get('status') == 'COMPLETE' and len(result.get('events', [])) == 2 and
                not result.get('missing'), 'EVENT_COVERAGE_INCOMPLETE')
        db_status = run('docker', 'exec', '-u', 'postgres', DB, 'psql', '-X', '-Atq', '-U', 'pit_v2_api',
                        '-d', 'pit_crypto_v2', '-c', "SELECT status FROM pit_jobs WHERE id='" + jid + "'")
        require(db_status == 'COMPLETED', 'JOB_NOT_PERSISTED')
        json_code, json_value = request('GET', job_path + '/export?format=json', key, base, headers=auth)
        csv_code, csv_value = request('GET', job_path + '/export?format=csv', key, base, headers=auth)
        require(json_code == 200 and isinstance(json_value, dict) and csv_code == 200 and
                isinstance(csv_value, str) and 'transactionHash' in csv_value, 'EXPORT_FAILED')
        print(f'PIT_V26_BASE_SEPOLIA_JOB_PASS events=2 coverage=COMPLETE duration_s={time.monotonic()-started:.2f} csv_bytes={len(csv_value)}')
    finally:
        deleted, _ = request('DELETE', job_path, key, base, headers=auth)
        require(deleted == 200, 'SYNTHETIC_JOB_DELETE_FAILED')
    require(request('GET', job_path, key, base, headers=auth)[0] == 404, 'JOB_STILL_ACCESSIBLE')
    heartbeat = run('docker', 'exec', '-u', 'postgres', DB, 'psql', '-X', '-Atq', '-U', 'pit_v2_api',
                    '-d', 'pit_crypto_v2', '-c',
                    "SELECT count(*) FROM pit_worker_heartbeat WHERE last_seen > now()-interval '2 minutes'")
    require(heartbeat == '1', 'WORKER_HEARTBEAT_STALE')
    print('PIT_V26_PERSISTENCE_EXPORT_DELETE_HEARTBEAT_PASS')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('PIT_V26_HOSTED_SMOKE_BLOCKED_OR_FAILED=' + type(error).__name__ + ':' + str(error).split()[0], file=sys.stderr)
        raise SystemExit(1)
