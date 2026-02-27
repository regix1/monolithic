    # Private Network Access (PNA) / CORS headers
    # Browsers block requests from public origins (e.g. store.epicgames.com) to
    # private/local IPs unless the server opts in. Since lancache resolves CDN
    # hostnames to a LAN address, we must send these headers so that browser-based
    # storefronts (Epic Games Store, etc.) can load images and assets.

    # Strip upstream CORS headers to prevent duplicates (browsers reject doubled
    # Access-Control-Allow-Origin). These are re-added below with correct values.
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_hide_header Access-Control-Allow-Methods;
    proxy_hide_header Access-Control-Allow-Headers;
    proxy_hide_header Access-Control-Expose-Headers;

    # Handle CORS preflight requests
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
        add_header Access-Control-Allow-Headers "*" always;
        add_header Access-Control-Allow-Private-Network "true" always;
        add_header Content-Length 0;
        add_header Content-Type "text/plain";
        return 204;
    }

    # Add PNA headers to all regular responses
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Private-Network "true" always;
