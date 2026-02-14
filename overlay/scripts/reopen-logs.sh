#!/bin/bash
# Signal nginx to reopen log files.
# Use after log rotation, deletion, or any external log manipulation.
# Usage: docker exec <container> /scripts/reopen-logs.sh
nginx -s reopen
