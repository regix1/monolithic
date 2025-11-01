#!/bin/bash

# Watchdog to ensure NGINX maintains access to log files
# Periodically signals NGINX to reopen logs to prevent file descriptor issues
CHECK_INTERVAL=${LOG_REOPEN_INTERVAL:-3600}

echo "Starting NGINX log watchdog (interval: ${CHECK_INTERVAL}s)"

while true; do
    sleep ${CHECK_INTERVAL}

    echo "Checking NGINX log access at $(date)"

    # Check if nginx is running
    if [ -f /run/nginx.pid ]; then
        NGINX_PID=$(cat /run/nginx.pid)

        # Check if the process exists
        if kill -0 $NGINX_PID 2>/dev/null; then
            echo "Signaling NGINX (PID: $NGINX_PID) to reopen log files"
            kill -USR1 $NGINX_PID

            if [ $? -eq 0 ]; then
                echo "Successfully signaled NGINX to reopen logs"
            else
                echo "Failed to signal NGINX (exit code: $?)"
            fi
        else
            echo "NGINX PID file exists but process not running"
        fi
    else
        echo "NGINX PID file not found, skipping log reopen"
    fi
done
