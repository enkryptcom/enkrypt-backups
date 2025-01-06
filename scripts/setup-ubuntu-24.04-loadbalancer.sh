#! /usr/bin/env bash

#
# This script sets up a new Ubuntu 24.04 server on AWS EC2 to run the Enkrypt API.
#
# What this script does:
# - Updates the system
# - Downloads some system packages for troubleshooting and server management
# - Sets up some friendly config defaults for admin tools (for bash, vim, tmux)
# - Modifies the system logging configuration for Promtail (log exporting service)
# - Creates users and groups for the services that will run on the server
# - Sets up a Prometheus exporter service for exporting system metrics to a remote Prometheus server
# - Sets up a Promtail service for exporting logs to a remote Loki server
#
# What this script DOES NOT DO:
# - Does NOT create a new server on EC2 (this script should be executed on a new server)
# - Does NOT set up firewall rules / security groups
# - Does NOT set up EC2 instance tags
# - Does NOT start or upload the server code
# - Does NOT configure or start Promtail (you need to know your Loki configuration for that)
#
# Steps:
# 1. Create a new Ubuntu 24.04 server in a private subnet in AWS EC2
# 2. Attach security groups
#   - Allow SSH ingress from your bastion host
#   - Allow HTTP/HTTPS egress to the public internet (required for package installation, to be removed after setup)
# 3. SSH into the server, for example `ssh -J ubuntu@bastion-host-public-ip ubuntu@target-host-private-ip`
# 4. Create a script file to hold this script `touch setup.sh`
# 5. Make the script executable `chmod +x setup.sh`
# 6. Copy the contents of this script into the setup.sh file
# 7. Execute the script `./setup.sh`
# 8. Remove the setup script `rm setup.sh`
# 9. Follow the next steps in the README.md file
#


set -euo pipefail

echo "Waiting for cloud-init to finish"
cloud-init status --wait
echo "Cloud-init finished"

echo "Updating apt packages"
sudo apt-get update

echo "Upgrading apt packages"
sudo apt-get upgrade -y

echo "Installing utilities: curl, jq, vim, tmux, bat, btop, dos2unix"
sudo apt-get install -y curl jq vim tmux bat unzip build-essential net-tools btop dos2unix

echo "Setting up journalctl"
journalctl_reload=0

# Systemd logs to journalctl, we want to limit the size of the journal to not fill up the disk
if grep -q "^SystemMaxUse=" "/etc/systemd/journald.conf"; then
	echo "SystemMaxUse already set in /etc/systemd/journald.conf: $(grep "^SystemMaxUse=" "/etc/systemd/journald.conf")"
else
	echo "Setting SystemMaxUse in /etc/systemd/journald.conf to 250M"
	echo "SystemMaxUse=250M" | sudo tee -a "/etc/systemd/journald.conf" >/dev/null
	journalctl_reload=1
fi

if [ "$journalctl_reload" -eq 1 ]; then
	echo "Restarting systemd-journald"
	sudo systemctl restart systemd-journald
fi

echo "Setting up bashrc"
tee -a >/dev/null ~/.bashrc << 'BASHRC'
# enable vim mode for stuff in terminal
set -o vi
export EDITOR=vim
export VISUAL=vim
BASHRC

echo "Setting up vimrc"
mkdir ~/.vim
tee ~/.vim/vimrc >/dev/null << VIMRC
set paste
syntax on
au BufRead /tmp/psql.edit* set syntax=sql
set belloff=all
set noerrorbells
set tabstop=2
set softtabstop=2
set shiftwidth=2
set expandtab
set smartindent
set nu rnu
set nowrap
set smartcase
set noswapfile
set nobackup
set incsearch
set t_Co=256
set hls
VIMRC

echo "Setting up tmux"
tee ~/.tmux.conf >/dev/null << TMUX_CONF
set-window-option -g mode-keys vi
bind-key "%" split-window -h -c "#{pane_current_path}"
bind-key "\"" split-window -v -c "#{pane_current_path}"
bind-key "c" new-window -c "#{pane_current_path}"
bind-key  -T    prefix k    select-pane -U
bind-key  -T    prefix j    select-pane -D
bind-key  -T    prefix l    select-pane -R
bind-key  -T    prefix h    select-pane -L
bind-key        C-k         resize-pane -U 5
bind-key        C-j         resize-pane -D 5
bind-key        C-l         resize-pane -R 5
bind-key        C-h         resize-pane -L 5
set -g default-terminal "xterm-256color"
set -g status-bg colour67
TMUX_CONF

echo "Creating \"node-exporter\" group"
sudo groupadd --system node-exporter

echo "Creating \"promtail\" group"
sudo groupadd --system promtail

echo "Creating \"node-exporter\" user"
sudo adduser \
	--system \
	--no-create-home \
	--disabled-password \
	--disabled-login \
	--shell /usr/sbin/nologin \
	--ingroup node-exporter \
	node-exporter

echo "Creating \"promtail\" user"
sudo adduser \
	--system \
	--no-create-home \
	--disabled-password \
	--disabled-login \
	--shell /usr/sbin/nologin \
	--ingroup promtail \
	promtail

echo "Adding \"promtail\" to \"systemd-journal\" group"
sudo usermod -aG systemd-journal promtail

echo "Adding \"ubuntu\" to \"node-exporter\" group"
sudo usermod -aG node-exporter ubuntu

echo "Adding \"ubuntu\" to \"promtail\" group"
sudo usermod -aG promtail ubuntu

echo "Creating \"/etc/promtail\" directory"
sudo mkdir /etc/promtail
sudo chown root:promtail /etc/promtail
sudo chmod 550 /etc/promtail

echo "Downloading AWS CLI"
curl -fL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
echo "Unzipping AWS CLI"
unzip -o awscliv2.zip
echo "Installing AWS CLI"
sudo ./aws/install
echo "Cleaning up AWS CLI artifacts"
rm awscliv2.zip
rm -rf aws

echo "Downloading Prometheus Node Exporter"
# Binary download & sha256sum come from the Prometheus Node Exporter GitHub releases (> Assets) page
# https://github.com/prometheus/node_exporter/releases
curl -fLJO https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz
echo "Verifying Prometheus Node Exporter download"
if [[ ! "$(echo "6809dd0b3ec45fd6e992c19071d6b5253aed3ead7bf0686885a51d85c6643c66 node_exporter-1.8.2.linux-amd64.tar.gz" | sha256sum -c)" ]]; then
	echo "Prometheus Node Exporter failed sha256sum check"
	exit 1
fi
echo "Extracting Prometheus Node Exporter"
tar xvf node_exporter-1.8.2.linux-amd64.tar.gz
echo "Setting up Node Exporter executable & symlink"
sudo chown root:node-exporter node_exporter-1.8.2.linux-amd64/node_exporter
sudo chmod 550 node_exporter-1.8.2.linux-amd64/node_exporter
sudo mv node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/node-exporter-1.8.2
sudo ln -s /usr/local/bin/node-exporter-1.8.2 /usr/local/bin/node-exporter
echo "Cleaning up Node Exporter artifacts"
rm -rf node_exporter-1.8.2.linux-amd64
rm node_exporter-1.8.2.linux-amd64.tar.gz

echo "Downloading Promtail"
# Binary download & sha256sum come from the Loki GitHub releases (> Assets) page
# https://github.com/grafana/loki/releases
curl -fLJO https://github.com/grafana/loki/releases/download/v3.3.1/promtail-linux-amd64.zip
echo "Verifying Promtail download"
if [[ ! "$(echo "5eb6332cb1a23c55a4151fe59f10f4390f4e7368fe80d881e42f585c6a2503e4 promtail-linux-amd64.zip" sha256sum -c)" ]]; then
	echo "Promtail failed sha256sum check"
	exit 1
fi
echo "Extracting Promtail"
unzip promtail-linux-amd64.zip
echo "Setting up Promtail executable & symlink"
sudo chown root:promtail promtail-linux-amd64
sudo chmod 550 promtail-linux-amd64
sudo mv promtail-linux-amd64 /usr/local/bin/promtail-3.3.1
sudo ln -s /usr/local/bin/promtail-3.3.1 /usr/local/bin/promtail
echo "Cleaning up Promtail artifacts"
rm promtail-linux-amd64.zip

echo "Creating Promtail environment file: \"/etc/promtail/env\""
sudo touch /etc/promtail/env
sudo chown root:ubuntu /etc/promtail/env
sudo chmod 640 /etc/promtail/env
sudo tee /etc/promtail/env >/dev/null << PROMTAIL_ENV
# Environment variables available to the Promtail configuration
# to be filled in by userdata on instance launch

# eg http://172.31.19.01:3100
LOKI_URL=

# eg dev, prod, test
STAGE=

# eg enkrypt-api-dev, enkrypt-api-prod
ENKRYPT_API_DEPLOYMENT_NAME=

PROMTAIL_ENV

echo "Creating Promtail config file: \"/etc/promtail/config.yml\""
sudo touch /etc/promtail/config.yml
sudo chown root:promtail /etc/promtail/config.yml
sudo chmod 640 /etc/promtail/config.yml
sudo tee /etc/promtail/config.yml >/dev/null << 'PROMTAIL_CONFIG'
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: ${LOKI_URL}/loki/api/v1/push
scrape_configs:
  - job_name: systemd
    journal:
      max_age: 12h
      path: /var/log/journal
      labels:
        job: systemd-journal
        stage: ${STAGE}
        app: enkrypt-api-loadbalancer
        hostname: ${HOSTNAME}
        enkrypt_api_deployment_name: ${ENKRYPT_API_DEPLOYMENT_NAME}
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: 'unit'
PROMTAIL_CONFIG

sudo apt install haproxy -y

# HAProxy errors
#
# HAProxy can throw errors when rules are violated such as
#   - client times out
#   - server times out
#   - client gets blocked
#   - etc...
#
# We define custom errors in files primarily so we can add support
# for json errors.
#
# Errors will use HTTP/1.0 because:
#   - HTTP/1.0 is widely supported
#   - HTTP/1.0 doesn't support keepalive, will close connections

echo "Creating HAProxy error files in /etc/haproxy/errors/_.json.http"

echo "Creating HAProxy error file \"/etc/haproxy/errors/400.json.http\""
sudo tee "/etc/haproxy/errors/400.json.http" >/dev/null <<EOF
HTTP/1.0 400 Bad Request
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":400,"message":"Bad Request: Your browser sent a request that this server could not understand."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/401.json.http\""
sudo tee "/etc/haproxy/errors/401.json.http" >/dev/null <<EOF
HTTP/1.0 401 Unauthorized
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":401,"message":"Unauthorized: Authorization is required to access this resource."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/403.json.http\""
sudo tee "/etc/haproxy/errors/403.json.http" >/dev/null <<EOF
HTTP/1.0 403 Forbidden
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":403,"message":"Forbidden: You do not have permission to access this resource."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/408.json.http\""
sudo tee "/etc/haproxy/errors/408.json.http" >/dev/null <<EOF
HTTP/1.0 408 Request Timeout
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":408,"message":"Request Timeout: Your request has timed out. Please try again later."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/413.json.http\""
sudo tee "/etc/haproxy/errors/413.json.http" >/dev/null <<EOF
HTTP/1.0 413 Payload Too Large
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":413,"message":"Payload Too Large: The request is larger than the server is willing or able to process."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/429.json.http\""
sudo tee "/etc/haproxy/errors/429.json.http" >/dev/null <<EOF
HTTP/1.0 429 Too Many Requests
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":429,"message":"Too Many Requests: You have exceeded the rate limit. Please try again later."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/500.json.http\""
sudo tee "/etc/haproxy/errors/500.json.http" >/dev/null <<EOF
HTTP/1.0 500 Internal Server Error
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":500,"message":"Internal Server Error: The server encountered an unexpected condition that prevented it from fulfilling the request."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/502.json.http\""
sudo tee "/etc/haproxy/errors/502.json.http" >/dev/null <<EOF
HTTP/1.0 502 Bad Gateway
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":502,"message":"Bad Gateway: The server returned an invalid or incomplete response."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/503.json.http\""
sudo tee "/etc/haproxy/errors/503.json.http" >/dev/null <<EOF
HTTP/1.0 503 Service Unavailable
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":503,"message":"Service Unavailable: Our service is currently unavailable. Please try again later."}
EOF

echo "Creating HAProxy error file \"/etc/haproxy/errors/504.json.http\""
sudo tee "/etc/haproxy/errors/504.json.http" >/dev/null <<EOF
HTTP/1.0 504 Gateway Timeout
Cache-Control: no-cache
Connection: close
Content-Type: application/json

{"status":504,"message":"Gateway Timeout: The server didn't respond in time. Please try again later."}
EOF

# Not strictly necessary but more compliant with HTTP standard
echo "Changing line endings of HAProxy error files to CRLF"
sudo unix2dos /etc/haproxy/errors/*.json.http

echo "Setting permissions on HAProxy error files"
sudo chown root:root /etc/haproxy/errors/*.json.http
sudo chmod 644 /etc/haproxy/errors/*.json.http

echo "Setting up script to regenerate HAProxy self-signed certificate"
if [ -f /usr/local/bin/regenerate-haproxy-self-signed-cert ]; then
	echo "regenerate-haproxy-self-signed-cert script already exists"
else
	echo "Creating regenerate-haproxy-self-signed-cert script"
	sudo tee /usr/local/bin/regenerate-haproxy-self-signed-cert >/dev/null << 'REGENERATE_HAPROXY_SELF_SIGNED_CERT'
#! /usr/bin/env bash

set -euo pipefail

echo "Setting up self-signed certificate for HAProxy"
original_umask=$(umask)
umask 077
sudo openssl \
  req -x509 \
  -newkey rsa:2048 \
  -keyout /etc/haproxy/key.pem \
  -out /etc/haproxy/cert.pem \
  -days 9999 \
  -nodes \
  -subj "/CN=generic" >/dev/null 2>&1
sudo cat /etc/haproxy/cert.pem /etc/haproxy/key.pem | sudo tee /etc/haproxy/self-signed-haproxy-cert.pem >/dev/null
sudo chmod 400 /etc/haproxy/self-signed-haproxy-cert.pem
sudo chown root:root /etc/haproxy/self-signed-haproxy-cert.pem
sudo rm /etc/haproxy/cert.pem /etc/haproxy/key.pem
umask "$original_umask"
echo "Finished setting up self-signed certificate for HAProxy at /etc/haproxy/self-signed-haproxy-cert.pem"
REGENERATE_HAPROXY_SELF_SIGNED_CERT
fi

sudo chown root:root /usr/local/bin/regenerate-haproxy-self-signed-cert
sudo chmod 755 /usr/local/bin/regenerate-haproxy-self-signed-cert

echo "Running regenerate-haproxy-self-signed-cert script"
sudo /usr/local/bin/regenerate-haproxy-self-signed-cert

sudo mv /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.bak
sudo tee /etc/haproxy/haproxy.cfg >/dev/null << 'HAPROXY_CONFIG'
global
  log /dev/log  local0
  log /dev/log  local1 notice
  chroot /var/lib/haproxy
  stats socket /run/haproxy/admin.sock mode 660 level admin
  stats timeout 30s
  user haproxy
  group haproxy
  daemon

  # default SSL material locations
  ca-base /etc/ssl/certs
  crt-base /etc/ssl/private

  # see https://ssl-config.mozilla.org/#server=haproxy&server-version=2.0.3&config=intermediate
  ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-C
  ssl-default-bind-ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
  ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets

http-errors json_errors
  errorfile 400 /etc/haproxy/errors/400.json.http
  errorfile 401 /etc/haproxy/errors/401.json.http
  errorfile 403 /etc/haproxy/errors/403.json.http
  errorfile 408 /etc/haproxy/errors/408.json.http
  errorfile 413 /etc/haproxy/errors/413.json.http
  errorfile 429 /etc/haproxy/errors/429.json.http
  errorfile 500 /etc/haproxy/errors/500.json.http
  errorfile 502 /etc/haproxy/errors/502.json.http
  errorfile 503 /etc/haproxy/errors/503.json.http
  errorfile 504 /etc/haproxy/errors/504.json.http

defaults
  log global
  mode  http
  option  httplog
  option  dontlognull
  option  forwardfor # x-forwarded-for proxy header
  retries  3 # number of times to try opening a connection to a server before giving up

  # Timeouts, see https://www.papertrail.com/solution/tips/haproxy-logging-how-to-tune-timeouts-for-performance/
  timeout connect     5s      # max time to wait for a server connection slot to open
  timeout client      5s      # inactivity timeout on the client for a half-closed connection
  timeout server      30s     # inactivity timeout on the server for a half-closed connection
  timeout queue       30s     # max time to wait in queue for a server connection slot to open
  timeout client-fin  5s      # how long to wait for client to send FIN packet to close a connection after one side closes
  timeout server-fin  5s      # how long to wait for server to send FIN packet to close a connection after one side closes
  timeout tarpit      3s      # max time to delay a suspicious request, hindering potential attackers

  # Compression (for the specified MIME types)
  compression algo gzip
  compression type application/json application/graphql text/html text/plain text/css application/javascript

  errorfiles json_errors

frontend stats
  bind *:8404
  stats enable
  stats uri /metrics
  stats show-legends
  stats show-desc
  stats show-node
  http-request use-service prometheus-exporter if { path /metrics }

frontend api_frontend
  mode http
  bind *:80
  # Change this to use your cert after you have one, if you have one
  # See /usr/local/bin/regenerate-haproxy-self-signed-cert to generate a new one
  bind *:443 ssl crt /etc/haproxy/self-signed-haproxy-cert.pem

  ## Security headers
  #
  # (some of these are not applicable to the enkrypt api app, namely X-Frame-Options and X-Content-Type-Options, but they're good practice anyway)

  # Only allow the site to be embedded in an iframe if it's the same site to prevent clickjacking
  http-response set-header X-Frame-Options SAMEORIGIN       if !{ res.hdr(X-Frame-Options) -m found }

  # Prevent browsers from MIME-sniffing a response away from the declared content-type
  http-response set-header X-Content-Type-Options nosniff   if !{ res.hdr(X-Content-Type-Options) -m found }

  # Enable HSTS for 1 year, include subdomains, and preload (forces browser to use https)
  http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" if !{ res.hdr(Strict-Transport-Security) -m found }

  ## Limit rate of incoming http requests

  # Stick table to store http request rates, 100k max entries, expire after 30s, store http request rate over 10s
  stick-table type ip size 100k expire 30s store http_req_rate(10s)

  # Track source ip's in the sticky table
  http-request track-sc0 src

  # Hard rate limit to 20 requests per every 10 seconds
  acl high_rate_limit sc_http_req_rate(0) gt 20

  # Tarpit (slow down) & deny high request rates
  http-request tarpit deny_status 429 if high_rate_limit

  # Limit request size to 10kb
  acl too_large req_len gt 10000

  http-request deny deny_status 413 if too_large

  ## Block headers with content smuggling or other invalid http attacks

  # No-more than a single "x-forwarded-for" header
  acl forbidden_hdrs hdr_cnt(x-forwarded-for) gt 1

  # Protect against localhost spoofing
  acl forbidden_hdrs hdr_beg(host) -i localhost

  # No-more than a single "host" header
  acl forbidden_hdrs hdr_cnt(host) gt 1

  # No-more than a single "content-length" header
  acl forbidden_hdrs hdr_cnt(content-length) gt 1

  # Can't have negative content-length
  acl forbidden_hdrs hdr_val(content-length) lt 0

  http-request tarpit deny_status 403 if forbidden_hdrs

  # Block urls with possible directory traversals attacks
  #   - two periods or period equivalents (eg periods url encoded)
  #     - .: regular period
  #     - %2e: url encoded period
  #   - followed by a forward slash
  #     - /: regular forward slash
  #     - %2f: url encoded forward slash
  #     - 2 backslashes [8 backslashes (in build script) -> 4 backslashes (in tee stdin) -> 2 backslashes (in file)]
  acl forbidden_uris url_reg -i .*(\.|%2e)(\.|%2e)(%2f|%5c|/|\\\\\\\\)

  # Block url's with: null bytes, <script, xmlrpc.php (wordpress xmlrpc api)
  acl forbidden_uris url_sub -i %00 <script xmlrpc.php

  # Block common worm attacks & potential sensitive files
  acl forbidden_uris path_end -i /root.exe /cmd.exe /default.ida /awstats.pl .asp .dll .git .env .sql .htpasswd .htaccess .gitignore .gitmodules .gitconfig .gitattributes .DS_Store .svn .svn/entries .svn/wc.db .svn/entries .svn/all-wcprops .svn/prop-base .svn/props .svn/text-base .svn/tmp

  http-request tarpit deny_status 403 if forbidden_uris

  ## Proxy targets

  default_backend api_backend

backend api_backend
  mode http
  balance roundrobin

  # Health check to run on upstream servers
  option httpchk GET /health

  # Upstream servers
  # Set these to your upstream servers
  # server http1 127.0.0.1:8080 check inter 15000 rise 2 fall 3 maxconn 2000
  # server http2 127.0.0.1:8080 check inter 15000 rise 2 fall 3 maxconn 2000
  # server http3 127.0.0.1:8080 check inter 15000 rise 2 fall 3 maxconn 2000

HAPROXY_CONFIG

echo "Setting up \"node-exporter\" systemd service: \"/etc/systemd/system/node-exporter.service\""
sudo tee /etc/systemd/system/node-exporter.service >/dev/null << 'NODE_EXPORTER_SERVICE'
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
Type=simple
User=node-exporter
ExecStart=/usr/local/bin/node-exporter
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
NODE_EXPORTER_SERVICE

echo "Setting up \"promtail\" systemd service: \"/etc/systemd/system/promtail.service\""
sudo tee /etc/systemd/system/promtail.service >/dev/null << 'PROMTAIL_SERVICE'
[Unit]
Description=Promtail Log Shipper
After=network.target

[Service]
Type=simple
User=promtail
Group=promtail
EnvironmentFile=/etc/promtail/env
ExecStart=/usr/local/bin/promtail -config.file /etc/promtail/config.yml -config.expand-env true -log.level debug
ExecReload=/bin/kill -SIGHUP $MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
PROMTAIL_SERVICE

echo "Enabling node exporter service"
sudo systemctl enable node-exporter.service

echo "Starting node exporter service"
sudo systemctl start node-exporter.service

echo "Waiting for node exporter to start"
node_exporter_attempts=0
while ! curl -sf "http://localhost:9100/metrics" >/dev/null; do
	((node_exporter_attempts++)) || true
	if [ "$node_exporter_attempts" -gt 10 ]; then
		echo "Failed to start node exporter service"
		journalctl -u node-exporter.service
		exit 1
	fi
	echo "Waiting for node exporter to start"
	sleep 1
done
echo "Node exporter started"

if ! sudo systemctl is-enabled haproxy; then
	echo "Enabling HAProxy"
	sudo systemctl enable haproxy
else
	echo "HAProxy is already enabled"
fi

if ! sudo systemctl is-active haproxy; then
	echo "Starting HAProxy"
	sudo systemctl start haproxy
else
	echo "HAProxy is already running"
fi

# setup symlinks for systemd administrators so they can get a better idea what's on the server & where the files are
echo "Setting up some symlinks to configurations, services and executables in /home/ubuntu/server"

if [ ! -e /home/ubuntu/server ]; then mkdir /home/ubuntu/server; fi

echo "Setting up /home/ubuntu/server/etc symlinks"
if [ ! -e /home/ubuntu/server/etc ]; then mkdir /home/ubuntu/server/etc; fi
ln -s /etc/promtail /home/ubuntu/server/etc/promtail || true
ln -s /etc/haproxy /home/ubuntu/server/etc/haproxy || true

echo "Setting up /home/ubuntu/server/etc-systemd-system symlinks"
if [ ! -e /home/ubuntu/server/etc-systemd-system ]; then mkdir /home/ubuntu/server/etc-systemd-system; fi
ln -s /etc/systemd/system/promtail.service /home/ubuntu/server/etc-systemd-system/promtail.service || true
ln -s /etc/systemd/system/node-exporter.service /home/ubuntu/server/etc-systemd-system/node-exporter.service || true

echo "Setting up /home/ubuntu/server/usr-local-bin symlinks"
if [ ! -e /home/ubuntu/server/usr-local-bin ]; then mkdir /home/ubuntu/server/usr-local-bin; fi
ln -s /usr/local/bin/promtail /home/ubuntu/server/usr-local-bin/promtail || true
ln -s /usr/local/bin/node-exporter /home/ubuntu/server/usr-local-bin/node-exporter || true
ln -s /usr/local/bin/regenerate-haproxy-self-signed-cert /home/ubuntu/server/usr-local-bin/regenerate-haproxy-self-signed-cert || true

# Used to make sure we don't accidentally deploy to the wrong servers
echo "Creating server-type-identifier file"
tee /home/ubuntu/server-type-identifier >/dev/null << 'IDENTIFIER'
enkrypt-api-loadbalancer
IDENTIFIER

chmod 440 /home/ubuntu/server-type-identifier

echo "Setting up readme"

README_TEXT=$(cat <<'README'
# Enkrypt API Load Balancer (HAProxy) server

## This server contains

- Node Exporter: installed manually from binary release (for exporting server metrics for collection via scraping by Prometheus, for monitoring and alerting in Grafana)
- Promtail: installed manually from binary release (for scraping logs and sending them to Loki for log aggregation and querying in Grafana)
- HAProxy: installed via apt (for load balancing and reverse proxying)

## Server administration

HAProxy is a reverse proxy and load balancer. It's configured to listen on port 80 and 443, and forward requests to the backend servers.

In our case it handles TLS termination (although by default only with a self-signed certificate), adds some trivial security, and forwards requests to the backend servers over HTTP.

You can control the HAProxy service with the following commands:

```sh
# Start the HAProxy service
sudo systemctl start haproxy

# Stop the HAProxy service
sudo systemctl stop haproxy

# Restart the HAProxy service
sudo systemctl restart haproxy

# Reload the HAProxy configuration without dropping connections
sudo systemctl reload haproxy

# Check the HAProxy service status
sudo systemctl status haproxy
```

You can find the HAProxy configuration file at `/etc/haproxy/haproxy.cfg`

You can find the HAProxy logs at `/var/log/haproxy.log` or by running `journalctl -u haproxy`.

## SSL / TLS Certificates

Note: Cloudflare proxied DNS records don't have to point to servers with valid SSL certificates, you can self sign & the
Cloduflare proxy will happily serve the site over HTTPS. This is because the Cloudflare proxy is the one that has the
valid SSL certificate, and the Cloudflare proxy is the one that connects to the origin server. The origin server doesn't
need a valid SSL certificate. (I don't know why Cloudflare allows this, sounds like a security risk but it's very helpful
to us).

As of the time of writing on 2025-05-22, I haven't figured out a simple, safe, secure, & automated way of setting up HTTPS
with HAProxy. The only way I know to generate a certificate on the load balancer server itself without setting up additional
servers and without using AWS services is to give it outgoing access to the internet.

If you *really* want to generate SSL certs on the proxy server itself, even if you setup a firewall to block all outgoing traffic
except for the letsencrypt at `acme-v02.api.letsencrypt.org` and setup a cron job to keep the ip's of `acme-v02.api.letsencrypt.org`
up to date, if the server ever becomes compromised and the attacker gains root they can just remove the firewall rules and your
server is cooked & the attacker has outgoing https access to your internet & the VPC (& control of your domain).
To reduce the risk of attacks, it's best to block outgoing traffic to the internet, and so we're stuck being unable to automate
the certificate generation process.

tl;dr for now certificate generation is manual. You can generate a certificate on your local machine and upload it to the
load balancer server. Or you can generate a certificate on the load balancer server itself, but be aware of the security

If you decide you stil want to go ahead with generating a certificate on the load balancer server itself, here's some ideas how you can do it:

```sh
# This is not complete, it's just some ideas on working with certbot & letsencrypt

sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot

# eg mysite.dev, subd.mysite.dev
sudo certbot certonly --standalone \
  -d "yourdomain_change_me" \
  --pre-hook "systemctl stop haproxy" \
  --post-hook "systemctl start haproxy"

sudo certbot certonly --standalone \
  -d "yourdomain_change_me" \
  --pre-hook "systemctl stop haproxy" \
  --post-hook "systemctl start haproxy"

sudo mkdir /etc/haproxy/certs
sudo chown root:root /etc/haproxy/certs
sudo chmod 750 /etc/haproxy/certs

sudo certbot certonly --standalone -d "yourdomain_change_me" \
  --deploy-hook "
    cat /etc/letsencrypt/live/yourdomain_change_me/fullchain.pem \
    /etc/letsencrypt/live/yourdomain_change_me/privkey.pem \
      | sudo tee /etc/haproxy/certs/yourdomain_change_me.pem >/dev/null \
    && systemctl reload haproxy" \
  --post-hook "systemctl start haproxy" \
```

## Getting started

After executing the setup script follow these steps to finish setting up the server.

These steps can be executed as part of a userdata script when launching from a template.

1. Restart the server
  [ ] `sudo reboot`
2. Setup HAProxy configuration
  [ ] Fill in the backend servers in /etc/haproxy/haproxy.cfg
  [ ] Setup the frontend and backend configurations in /etc/haproxy/haproxy.cfg, include tls/ssl certs, if needed
  [ ] Update HAProxy systemd config and enable all the security flags (find unit file location using systemd cat haproxy)
3. Setup and attach a Security Group to this Load Balancer Server
  [ ] Whitelist egress to the Loki Security Group on port 3100 (make sure to whitelist ingress in the Loki Security Group if not already)
  [ ] Whitelist ingress from the Prometheus Security Group to Node Exporter on port 9100 (make sure to whitelist egress in the Prometheus Security Group if not already)
  [ ] Whitelist ingress from the Prometheus Security Group to HAProxy stats on port 8404 (make sure to whitelist egress in the Prometheus Security Group if not already)
  [ ] Whitelist egress to your application servers' Security Group on the port they're listening on
4. Attach the new Security Group to the server and remove the Security Group allowing http/s egress
  [ ] Remove the Security Group allowing http/s egress from this EC2 instance
  [ ] Attach your new Security Group to this EC2 instance
5. Configure Promtail
  [ ] fill in the environment variables in /etc/promtail/env
6. Enable and start the Promtail service
  [ ] sudo systemctl enable promtail
  [ ] sudo systemctl start promtail
  [ ] sudo systemctl status promtail
7. Setup a proper SSL certificate for HAProxy if you want / need to. Note that Cloudflare proxies allow self-signed certificates
8. Enable and start the HAProxy service, if not already
  [ ] sudo systemctl enable haproxy
  [ ] sudo systemctl start haproxy
  [ ] sudo systemctl status haproxy
9. Set tags on the EC2 instance for monitoring and billing purposes. The tags will be detected by the monitoring system (Prometheus) and tags preceeded by enkryptapi: will be turned into labels on the metrics.
  [ ] Name=enkrypt-api-(dev|prod|test)-loadbalancer
  [ ] enkryptapi:stage=dev|prod|test
  [ ] enkryptapi:app=enkrypt-api-loadbalancer
  [ ] enkryptapi:enkrypt_api_deployment_name=enkrypt-api-(dev|prod|test)
  [ ] prom:exporter:node=9100
  [ ] prom:exporter:haproxy=8404
10. Restart the server
  [ ] `sudo reboot`

README
)

# create the readme
if [ -f /home/ubuntu/README.md ]; then
	echo "README.md already exists"
else
	echo "Creating README.md"
	echo "$README_TEXT" > /home/ubuntu/README.md
fi

# print the readme
echo "$README_TEXT"

echo "Finished setup script"
