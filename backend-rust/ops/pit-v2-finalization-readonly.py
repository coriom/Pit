#!/usr/bin/env python3
"""Sanitized read-only gate for the existing PIT V2 canary and backup readiness."""
import json
from pathlib import Path
import stat
import subprocess

APP = 'b8ohynbyx8dwsl5n46qdgjop'
PROJECT = 'pit-crypto-v2-canary'
VOLUME = PROJECT + '_pit-v2-db-data'
DATA = PROJECT + '_pit-v2-data'
RPC = PROJECT + '_pit-v2-rpc'
ROOT = Path('/var/backups/pit-v2')


def output(*args, timeout=20):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError(f'{args[0]}_{args[1] if len(args)>1 else ""}_FAILED')
    return result.stdout


def info(name):
    return json.loads(output('docker', 'inspect', name))[0]


def members(network):
    data = json.loads(output('docker', 'network', 'inspect', network))[0]
    return sorted(v.get('Name', '') for v in data.get('Containers', {}).values())


def state(name):
    item = info(name)
    health = item['State'].get('Health', {}).get('Status', 'none')
    labels = item['Config'].get('Labels') or {}
    routes = any(key.startswith('traefik.http.') for key in labels)
    ports = bool(item['HostConfig'].get('PortBindings'))
    print(f'{name}={item["State"]["Status"]}|health={health}|restarts={item["RestartCount"]}|'
          f'oom={item["State"].get("OOMKilled")}|ports={ports}|routes={routes}|'
          f'cpu={item["HostConfig"].get("NanoCpus")}|memory={item["HostConfig"].get("Memory")}', flush=True)
    return item


print('PIT_V25_READONLY_BEGIN', flush=True)
db = state(PROJECT + '-pit-v2-db-1')
state(PROJECT + '-pit-v2-api-1')
state(PROJECT + '-pit-v2-worker-1')
state('coolify-proxy')
for name in ['pit-crypto-backend-canary-pit-api-1', 'pit-crypto-backend-canary-pit-worker-1',
             'pit-crypto-backend-canary-pit-db-1', 'web-fobx4ufaw6acnldok3x8yywu',
             'commerce-6oqotmrdqp3wesd87idwpkub', 'dxco90jwpdxyennmquv2elyj-backend-1']:
    state(name)
mounts = db['Mounts']
print('V2_DB_VOLUME=' + ('PASS' if len(mounts) == 1 and mounts[0].get('Name') == VOLUME else 'FAIL'), flush=True)
print('V2_DB_NETWORK=' + ('PASS' if set(db['NetworkSettings']['Networks']) == {DATA} else 'FAIL'), flush=True)
for network in [APP, DATA, RPC]:
    print(f'NETWORK_{network}=' + ','.join(members(network)), flush=True)
print('COOLIFY_IMAGE=' + str(info('coolify')['Config']['Image']).split('@')[0], flush=True)

sql = ("SELECT current_setting('server_version_num')||'|'||"
       "pg_database_size('pit_crypto_v2')||'|'||"
       "(SELECT count(*) FROM pg_roles WHERE rolname='pit_v2_backup')||'|'||"
       "(SELECT coalesce(bool_or(type='local' AND auth_method='trust'),false) FROM pg_hba_file_rules WHERE error IS NULL)||'|'||"
       "(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'pit_%')")
pg = output('docker', 'exec', '-u', 'postgres', PROJECT + '-pit-v2-db-1', 'psql', '-X', '-Atq',
            '-U', 'pit_v2_api', '-d', 'pit_crypto_v2', '-c', sql).strip().split('|')
print('POSTGRES_MAJOR=' + str(int(pg[0]) // 10000), flush=True)
print('V2_DB_SIZE_BYTES=' + pg[1], flush=True)
print('BACKUP_ROLE_COUNT=' + pg[2], flush=True)
print('LOCAL_SOCKET_TRUST=' + pg[3], flush=True)
print('PIT_TABLE_COUNT=' + pg[4], flush=True)
if ROOT.exists():
    metadata = ROOT.stat()
    print('PIT_BACKUP_ROOT=present|uid=' + str(metadata.st_uid) + '|mode=' + oct(stat.S_IMODE(metadata.st_mode)) +
          '|archive_count=' + str(len(list(ROOT.glob('pit-v2-*.dump')))), flush=True)
else:
    print('PIT_BACKUP_ROOT=absent', flush=True)
timer = subprocess.run(['systemctl', 'is-enabled', 'pit-v2-backup.timer'], capture_output=True, text=True)
print('PIT_BACKUP_TIMER=' + (timer.stdout.strip() or 'absent'), flush=True)
memory = output('free', '-m').splitlines()[1].split()
disk = output('df', '-BG', '/').splitlines()[-1].split()
print('HOST_AVAILABLE_MIB=' + memory[6], flush=True)
print('HOST_DISK_FREE=' + disk[3], flush=True)

php = r'''
$a=\App\Models\Application::where('uuid','b8ohynbyx8dwsl5n46qdgjop')->first();
if (!$a) {echo "APP_ABSENT\n";} else {
 echo "APP_STATUS=".$a->getRawOriginal('status')."\n";
 echo "APP_RAW_COMPOSE_SHA256=".hash('sha256',$a->docker_compose_raw)."\n";
 echo "APP_DOMAIN=".(empty($a->fqdn)?'EMPTY':'SET')."\n";
 echo "APP_ADDITIONAL_SERVERS=".$a->additional_servers()->count()."\n";
 $y=\Symfony\Component\Yaml\Yaml::parse($a->docker_compose_raw);
 $m=$y['services']['pit-v2-migrate']??[];
 echo "MIGRATE_RESTART=".($m['restart']??'ABSENT')."|EXCLUDE=".(($m['exclude_from_hc']??false)?'YES':'NO')."\n";
 foreach ($a->deployment_queue()->orderByDesc('id')->limit(3)->get(['deployment_uuid','status']) as $j) {
   echo "DEPLOYMENT=".$j->deployment_uuid."|".$j->status."\n";
 }
}
'''
for line in output('docker', 'exec', 'coolify', 'php', 'artisan', 'tinker', '--execute=' + php,
                   timeout=30).splitlines():
    if line.startswith(('APP_', 'MIGRATE_', 'DEPLOYMENT=')):
        print(line, flush=True)
print('PIT_V25_READONLY_END', flush=True)
