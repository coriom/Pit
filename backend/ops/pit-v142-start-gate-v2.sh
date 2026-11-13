#!/usr/bin/env bash
set -Eeuo pipefail

app_uuid=c1fsywygziaxxyz2aeks8ktt
old_uuid=d47gm6kkdopzfurtmcd4lgpo
old_volume=d47gm6kkdopzfurtmcd4lgpo_pit-db-data

echo PIT_RAW_START_GATE_BEGIN
docker exec -i -w /var/www/html coolify php <<'PHP'
<?php
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$a = \App\Models\Application::query()->where('uuid', 'c1fsywygziaxxyz2aeks8ktt')->first();
if (!$a) { echo "APP_FOUND=NO\n"; exit(31); }
$storages = $a->persistentStorages()->get();
$priorJobs = $a->deployment_queue()->get();
$storageSafe = $storages->count() === 1 && $storages->every(fn ($v) =>
  $v->name === 'c1fsywygziaxxyz2aeks8ktt_pit-db-data'
  && $v->mount_path === '/var/lib/postgresql/data'
  && trim((string) $v->host_path) === ''
  && $v->resource_type === \App\Models\Application::class
  && (int) $v->resource_id === (int) $a->id
);
$checks = [
  'COOLIFY_VERSION_475' => config('constants.coolify.version') === '4.7.5',
  'APP_NAME' => $a->name === 'pit-backend-canary-raw',
  'BUILD_PACK_COMPOSE' => $a->build_pack === 'dockercompose',
  'RAW_MODE' => (bool) $a->settings?->is_raw_compose_deployment_enabled,
  'CUSTOM_START_EMPTY' => trim((string) $a->docker_compose_custom_start_command) === '',
  'CUSTOM_BUILD_EMPTY' => trim((string) $a->docker_compose_custom_build_command) === '',
  'IMAGE_OVERRIDES_EMPTY' => empty((array) $a->docker_compose_image_overrides),
  'PRE_COMMAND_EMPTY' => trim((string) $a->pre_deployment_command) === '',
  'POST_COMMAND_EMPTY' => trim((string) $a->post_deployment_command) === '',
  'PRE_CONTAINER_EMPTY' => trim((string) $a->pre_deployment_command_container) === '',
  'POST_CONTAINER_EMPTY' => trim((string) $a->post_deployment_command_container) === '',
  'DOCKERFILE_EMPTY' => trim((string) $a->dockerfile) === '',
  'COMPOSE_PATH_MATCH' => $a->docker_compose_location === '/backend/compose.canary.coolify-raw.yml',
  'SOURCE_PIN_MATCH' => $a->git_branch === '7491452b31efe6e8465447ee3760a2dbef553a8f' && in_array((string) $a->git_commit_sha, ['', '7491452b31efe6e8465447ee3760a2dbef553a8f'], true),
  'NO_DOMAIN' => trim((string) $a->fqdn) === '',
  'NO_PORT_MAPS' => trim((string) $a->ports_mappings) === '',
  'NO_CUSTOM_RUN_OPTIONS' => trim((string) $a->custom_docker_run_options) === '',
  'NO_ADDITIONAL_NETWORKS' => $a->additional_networks()->count() === 0,
  'DEPLOYMENT_HISTORY_ONLY_FAILED_MATERIALIZATION' => $priorJobs->count() === 1
    && $priorJobs->first()?->deployment_uuid === 'wetnj0krevoliclckot5jhsl'
    && $priorJobs->first()?->status === 'failed',
  'AUTO_DEPLOY_DISABLED' => ! (bool) $a->settings?->is_auto_deploy_enabled,
  'PREVIEWS_DISABLED' => ! (bool) $a->settings?->is_preview_deployments_enabled,
  'BUILD_SERVER_DISABLED' => ! (bool) $a->settings?->is_build_server_enabled,
  'SHARED_NETWORK_DISABLED' => ! (bool) $a->settings?->connect_to_docker_network,
  'NO_FILE_STORAGES' => $a->fileStorages()->count() === 0,
  'PERSISTENT_STORAGE_SAFE' => $storageSafe,
  'MAINTENANCE_DISABLED' => ! (bool) $a->is_maintenance_enabled,
];
foreach (['PIT_DB_PASSWORD', 'PIT_DATABASE_URL', 'PIT_BACKEND_INVITE_SHA256', 'PIT_EDGE_HMAC_KEY'] as $key) {
  $rows = $a->environment_variables()->where('key', $key)->get();
  $checks['PRIVATE_VAR_' . $key] = $rows->count() === 1 && $rows->first()->is_runtime && trim((string) $rows->first()->value) !== '';
}
$pass = true;
foreach ($checks as $name => $ok) {
  echo $name . '=' . ($ok ? 'PASS' : 'FAIL') . "\n";
  if (!$ok) $pass = false;
}
echo 'APP_STATUS=' . preg_replace('/[^a-zA-Z0-9_.,:-]/', '', (string) $a->status) . "\n";
echo 'APP_DESTINATION_NETWORK=' . preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string) $a->destination?->network) . "\n";
echo 'PERSISTENT_STORAGE_COUNT=' . $storages->count() . "\n";
foreach ($storages as $v) echo 'PERSISTENT_STORAGE_NAME=' . preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string) $v->name) . "\n";
exit($pass ? 0 : 32);
PHP

for service in pit-api pit-worker pit-db pit-migrate; do
  container="${service}-${old_uuid}"
  state=$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)
  echo "OLD_${service^^}_STATE=${state:-absent}"
  if [[ "$state" == running ]]; then exit 33; fi
done

docker volume inspect "$old_volume" >/dev/null
echo OLD_VOLUME=PRESENT

for network in "$app_uuid" pit-crypto-backend-canary_pit-data pit-crypto-backend-canary_pit-rpc; do
  if docker network inspect "$network" >/dev/null 2>&1; then
    NETWORK_NAME="$network" docker network inspect "$network" --format '{{json .Containers}}' | python3 -c 'import json,os,sys; d=json.load(sys.stdin) or {}; names=sorted((v.get("Name", "") for v in d.values())); print("NETWORK_"+os.environ["NETWORK_NAME"]+"_MEMBERS="+(",".join(names) if names else "none"))'
  else
    echo "NETWORK_${network}_MEMBERS=absent"
  fi
done

new_running=$(docker ps --filter "label=coolify.applicationUuid=${app_uuid}" --format '{{.Names}}' | wc -l)
echo NEW_APP_RUNNING_CONTAINERS="$new_running"
if [[ "$new_running" -ne 0 ]]; then exit 34; fi
generated=/data/coolify/applications/c1fsywygziaxxyz2aeks8ktt/docker-compose.yaml
runtime_env=/data/coolify/applications/c1fsywygziaxxyz2aeks8ktt/.env
printf '%s  %s\n' d336bab79447d661bd2a2c48f57a1325ff451e32a826dc960ca76e96f495c122 "$generated" | sha256sum -c - >/dev/null
[[ -s "$runtime_env" ]]
docker compose --env-file "$runtime_env" --project-directory /data/coolify/applications/c1fsywygziaxxyz2aeks8ktt -f "$generated" config --quiet
echo GENERATED_COMPOSE_AND_HOST_ENV=PASS
python3 - <<'PY_CHECK'
import json, subprocess
app='c1fsywygziaxxyz2aeks8ktt'
def members(network):
    p=subprocess.run(['docker','network','inspect',network,'--format','{{json .Containers}}'],capture_output=True,text=True)
    if p.returncode: return None
    return sorted(v.get('Name','') for v in (json.loads(p.stdout) or {}).values())
assert members(app)==['coolify-proxy'], 'MANAGEMENT_NETWORK_MEMBERS'
for network in ('pit-crypto-backend-canary_pit-data','pit-crypto-backend-canary_pit-rpc'):
    assert members(network) in (None,[]), 'PIT_DATA_OR_RPC_NETWORK_NOT_EMPTY'
assert subprocess.run(['docker','ps','-a','--filter','label=com.docker.compose.project=pit-crypto-backend-canary','--format','{{.ID}}'],capture_output=True,text=True,check=True).stdout.strip()=='', 'NEW_PIT_CONTAINERS_EXIST'
assert subprocess.run(['docker','volume','inspect','pit-crypto-backend-canary_pit-db-data'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0, 'NEW_PIT_VOLUME_EXISTS'
print('NETWORK_AND_CONTAINER_BASELINE=PASS')
PY_CHECK
echo PIT_RAW_START_GATE_PASS
