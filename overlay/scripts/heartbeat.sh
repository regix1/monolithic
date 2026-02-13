#!/bin/bash

if [[ "$1" == "" ]]; then
	BEATTIME=${BEAT_TIME}
else
	BEATTIME=$1
	if [[ "$1" == 0 ]]; then
		exit 0;
	fi
fi


while true; do
    sleep "$BEATTIME"
    curl --fail -s -o /dev/null http://127.0.0.1/lancache-heartbeat || true
done
