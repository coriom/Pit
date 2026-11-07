"""Bounded, read-only Docker snapshot for the shared VPS operator.

Run only after reviewing this file. It never emits environment variables,
mount paths, application logs, database rows or arbitrary label values.
"""
import json
import re
import subprocess
import sys


def docker(*args):
    result = subprocess.run(
        ["docker", *args], check=True, capture_output=True, text=True, timeout=20
    )
    return result.stdout


def optional_docker(*args):
    try:
        return docker(*args).strip()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return "unavailable"


def selected_labels(labels):
    suffixes = (".rule", ".priority", ".entrypoints", ".tls", ".tls.certresolver", ".middlewares")
    return {
        key: value
        for key, value in (labels or {}).items()
        if key == "traefik.enable"
        or (key.startswith("traefik.http.routers.") and key.endswith(suffixes))
    }


def main():
    ids = docker("ps", "-q").splitlines()
    if len(ids) > 100:
        raise ValueError("CONTAINER_LIMIT")
    print(f"running_containers={len(ids)}")
    if ids:
        stats = docker("stats", "--no-stream", "--format", "{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}").splitlines()
        stats_by_id = {line.split("|", 1)[0]: line.split("|", 1)[1] for line in stats if "|" in line}
        fields = '{{.Name}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.CpuQuota}}|{{.HostConfig.CpuPeriod}}|{{.HostConfig.Memory}}|{{.RestartCount}}|{{.State.OOMKilled}}|{{range $k,$v := .NetworkSettings.Networks}}{{printf "%s," $k}}{{end}}'
        for container_id in ids:
            name, nanocpus, quota, period, memory, restarts, oom, networks = docker(
                "inspect", "--format", fields, container_id
            ).strip().split("|", 7)
            label_keys = docker(
                "inspect", "--format", '{{range $k,$v := .Config.Labels}}{{println $k}}{{end}}', container_id
            ).splitlines()
            labels = {}
            for key in label_keys:
                if re.fullmatch(r"[A-Za-z0-9._-]+", key) and key in selected_labels({key: ""}) and len(labels) < 30:
                    labels[key] = docker("inspect", "--format", '{{index .Config.Labels "' + key + '"}}', container_id).strip()
            ident = container_id[:12]
            print(json.dumps({
                "id": ident,
                "name": name.lstrip("/"),
                "cpu_quota": int(nanocpus) or [int(quota), int(period)],
                "memory_limit_bytes": int(memory),
                "restart_count": int(restarts),
                "oom_killed": oom == "true",
                "networks": sorted(filter(None, networks.split(","))),
                "routing_labels": labels,
                "current_cpu_and_memory": stats_by_id.get(ident, "unavailable"),
            }, sort_keys=True))
    print("docker_storage_summary:")
    print(optional_docker("system", "df"))
    print("docker_network_names:")
    print(optional_docker("network", "ls", "--format", "{{.Name}}"))
    volumes = optional_docker("volume", "ls", "-q")
    print("docker_volume_count=" + (str(len(volumes.splitlines())) if volumes != "unavailable" else volumes))


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, KeyError, ValueError) as error:
        step = error.cmd[1] if isinstance(error, (subprocess.CalledProcessError, subprocess.TimeoutExpired)) and len(error.cmd) > 1 else "parse"
        print(f"snapshot_failed={type(error).__name__} step={step}", file=sys.stderr)
        sys.exit(1)
