#!/bin/bash
set -eo pipefail


# Wait for host-mounted volumes to be ready before any other startup work runs.
#
# Why this hook exists:
# After a host power loss, the cache filesystem backing ${CACHE_ROOT} (typically a
# large RAID/ZFS pool or NAS export) can take significantly longer to come online
# than the Docker daemon itself. If the container is started by Docker before the
# host directory is actually mounted, the bind mount will resolve to an empty,
# possibly read-only stub on the host's root filesystem. Subsequent hooks
# (config check, map generation, perms check) will then either crash under set -e
# or — worse — silently start writing real cache data into the wrong place.
#
# This hook fails fast and loudly when the volumes are not yet writable. The
# non-zero exit propagates through /init/entrypoint so Docker sees the container
# fail; the compose-level restart policy (restart: always) then brings it back,
# at which point the host mount has usually settled. This is safer than spinning
# up half-broken nginx state pointing at the wrong filesystem.
#
# Tunable: VOLUME_WAIT_TIMEOUT (seconds, default 120).

readonly VOLUME_WAIT_TIMEOUT="${VOLUME_WAIT_TIMEOUT:-120}"
readonly POLL_INTERVAL_SECONDS=1
readonly PROGRESS_INTERVAL_SECONDS=10
readonly REQUIRED_VOLUMES=(
    "/data/cache"
    "/data/logs"
    "/data/config"
)

# Validate timeout is a positive integer; fall back to 120 otherwise so a
# malformed env var cannot cause an arithmetic error under set -e. The warning
# is routed to stderr because the resolved value is returned on stdout and the
# caller captures it via command substitution.
validate_timeout() {
    local value="${1}"
    if [[ ! "${value}" =~ ^[0-9]+$ ]] || [ "${value}" -lt 1 ]; then
        echo "[wait-for-volumes] WARNING: VOLUME_WAIT_TIMEOUT='${value}' is not a positive integer; using 120s" >&2
        echo "120"
    else
        echo "${value}"
    fi
}

# Probe whether a path is a directory we can actually write to. We do not trust
# `[ -w ]` alone because some overlay/NFS edge cases report writable but the
# first write fails with EROFS. A real test-write is the only reliable signal.
is_volume_ready() {
    local path="${1}"
    local probe

    if [ ! -e "${path}" ]; then
        return 1
    fi
    if [ ! -d "${path}" ]; then
        return 1
    fi

    probe="${path}/.volume_ready_probe.$$"
    if ! ( : > "${probe}" ) 2>/dev/null; then
        return 1
    fi
    rm -f "${probe}" 2>/dev/null || true
    return 0
}

# Block until the given path is ready or the deadline passes. Emits a progress
# line every PROGRESS_INTERVAL_SECONDS so users tailing docker logs can see the
# wait is intentional and not a hang.
wait_for_one_volume() {
    local path="${1}"
    local deadline="${2}"
    local started_at
    local now
    local elapsed
    local last_progress_at
    local since_progress

    started_at=$(date +%s)
    last_progress_at="${started_at}"

    echo "[wait-for-volumes] Checking ${path} ..."

    while true; do
        if is_volume_ready "${path}"; then
            now=$(date +%s)
            elapsed=$(( now - started_at ))
            echo "[wait-for-volumes]   ${path} is writable (waited ${elapsed}s)"
            return 0
        fi

        now=$(date +%s)
        if [ "${now}" -ge "${deadline}" ]; then
            elapsed=$(( now - started_at ))
            echo "[wait-for-volumes] ERROR: ${path} not writable after ${elapsed}s" >&2
            echo "[wait-for-volumes]        The host bind mount for this path is likely not yet ready." >&2
            echo "[wait-for-volumes]        Common cause: a large RAID/ZFS array backing CACHE_ROOT" >&2
            echo "[wait-for-volumes]        is still being imported after a host reboot." >&2
            echo "[wait-for-volumes]        See contrib/lancache.service for systemd ordering that" >&2
            echo "[wait-for-volumes]        delays Docker until the storage pool is online." >&2
            echo "[wait-for-volumes]        You can also raise VOLUME_WAIT_TIMEOUT (currently ${VOLUME_WAIT_TIMEOUT}s)." >&2
            return 1
        fi

        since_progress=$(( now - last_progress_at ))
        if [ "${since_progress}" -ge "${PROGRESS_INTERVAL_SECONDS}" ]; then
            elapsed=$(( now - started_at ))
            echo "[wait-for-volumes]   still waiting on ${path} (${elapsed}s elapsed, timeout ${VOLUME_WAIT_TIMEOUT}s)"
            last_progress_at="${now}"
        fi

        sleep "${POLL_INTERVAL_SECONDS}"
    done
}

main() {
    local timeout
    local now
    local deadline
    local path

    timeout=$(validate_timeout "${VOLUME_WAIT_TIMEOUT}")
    now=$(date +%s)
    deadline=$(( now + timeout ))

    echo "[wait-for-volumes] Waiting up to ${timeout}s for host volumes to become writable"

    for path in "${REQUIRED_VOLUMES[@]}"; do
        if ! wait_for_one_volume "${path}" "${deadline}"; then
            exit 1
        fi
    done

    echo "[wait-for-volumes] All required volumes are ready"
}

main "$@"
