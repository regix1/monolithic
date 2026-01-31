# Multi-arch Alpine base with nginx included
FROM nginx:alpine
LABEL version=3
LABEL description="Single caching container for caching game content at LAN parties."
LABEL maintainer="LanCache.Net Team <team@lancache.net>"

# Install required packages
RUN apk add --no-cache \
    bash \
    supervisor \
    inotify-tools \
    jq \
    git \
    ca-certificates \
    curl \
    findutils \
    coreutils \
    shadow \
    openssl \
    bind-tools

ENV GENERICCACHE_VERSION=2 \
    CACHE_MODE=monolithic \
    WEBUSER=nginx \
    PUID=33 \
    PGID=33 \
    CACHE_INDEX_SIZE=500m \
    CACHE_DISK_SIZE=1000g \
    MIN_FREE_DISK=10g \
    CACHE_MAX_AGE=3560d \
    CACHE_SLICE_SIZE=1m \
    UPSTREAM_DNS="8.8.8.8 8.8.4.4" \
    BEAT_TIME=1h \
    LOGFILE_RETENTION=3560 \
    CACHE_DOMAINS_REPO="https://github.com/uklans/cache-domains.git" \
    CACHE_DOMAINS_BRANCH=master \
    NGINX_WORKER_PROCESSES=auto \
    NGINX_LOG_FORMAT=cachelog \
    NGINX_PROXY_CONNECT_TIMEOUT=300s \
    NGINX_PROXY_SEND_TIMEOUT=300s \
    NGINX_PROXY_READ_TIMEOUT=300s \
    NGINX_SEND_TIMEOUT=300s \
    NGINX_LOG_TO_STDOUT=false \
    NOSLICE_FALLBACK=false \
    NOSLICE_THRESHOLD=3 \
    ENABLE_UPSTREAM_KEEPALIVE=false \
    UPSTREAM_REFRESH_INTERVAL=1h \
    UPSTREAM_KEEPALIVE_CONNECTIONS=16 \
    UPSTREAM_KEEPALIVE_REQUESTS=10000 \
    UPSTREAM_KEEPALIVE_TIMEOUT=5m

# Setup directories
RUN mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled \
    /etc/nginx/stream-available /etc/nginx/stream-enabled /etc/nginx/stream.d \
    /etc/nginx/conf.d /var/log/nginx /var/www /var/log/supervisor \
    && rm -f /etc/nginx/conf.d/default.conf \
    && chown -R nginx:nginx /var/log/nginx /var/www

COPY overlay/ /

RUN rm -f /etc/nginx/sites-enabled/* /etc/nginx/stream-enabled/* 2>/dev/null || true; \
    rm -f /etc/nginx/conf.d/gzip.conf 2>/dev/null || true; \
    chmod 755 /scripts/* 2>/dev/null || true; \
    chmod 755 /hooks/entrypoint-pre.d/*.sh 2>/dev/null || true; \
    chmod -R 755 /init /hooks 2>/dev/null || true; \
    mkdir -m 755 -p /data/cache; \
    mkdir -m 755 -p /data/info; \
    mkdir -m 755 -p /data/logs; \
    mkdir -m 755 -p /tmp/nginx/; \
    chown -R nginx:nginx /data/; \
    mkdir -p /etc/nginx/sites-enabled; \
    ln -sf /etc/nginx/sites-available/10_cache.conf /etc/nginx/sites-enabled/10_generic.conf; \
    ln -sf /etc/nginx/sites-available/20_upstream.conf /etc/nginx/sites-enabled/20_upstream.conf; \
    ln -sf /etc/nginx/sites-available/30_metrics.conf /etc/nginx/sites-enabled/30_metrics.conf; \
    ln -sf /etc/nginx/stream-available/10_sni.conf /etc/nginx/stream-enabled/10_sni.conf; \
    mkdir -m 755 -p /data/cachedomains; \
    mkdir -m 755 -p /tmp/nginx

RUN git clone --depth=1 --no-single-branch https://github.com/uklans/cache-domains/ /data/cachedomains

VOLUME ["/data/logs", "/data/cache", "/data/cachedomains", "/var/www"]

EXPOSE 80 443 8080
WORKDIR /scripts

HEALTHCHECK --interval=1m --timeout=10s --start-period=120s --retries=3 \
    CMD curl --fail http://127.0.0.1/lancache-heartbeat || exit 1

ENTRYPOINT ["/bin/bash", "-e", "/init/entrypoint"]
CMD ["run"]
