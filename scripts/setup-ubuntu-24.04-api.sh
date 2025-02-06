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
# - Does NOT set up a load balancer / reverse proxy to receive incoming requests
#
# How to execute this script:
# 1. Create a new Ubuntu 24.04 server in a private subnet in AWS EC2
# 2. Attach security groups to
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

echo "Installing utilities: curl, jq, vim, tmux, batcat, unzip, net-tools, btop"
sudo apt-get install -y curl jq vim tmux bat unzip net-tools btop

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

# Journalctl forwards logs to syslog, we want to disable this so that syslog doesn't fill up the disk
# syslog limits logs by time-based rotation instead of size so when there's high log frequency it fills
# up disk. The simplest way to avoid this is to disable forwarding to syslog. We don't need syslog
# anyway since we can use promtail to forward service logs to loki
if grep -q "^ForwardToSyslog=" "/etc/systemd/journald.conf"; then
	# This has already been set by someone else, don't modify it
	# (otherwise the system defaults may have changed making our conditional check incorrect)
	echo "ForwardToSyslog already set in /etc/systemd/journald.conf: $(grep "^ForwardToSyslog=" "/etc/systemd/journald.conf")"
else
	# Disable forwarding journald logs to syslog
	echo "Setting ForwardToSyslog in /etc/systemd/journald.conf to no"
	echo "ForwardToSyslog=no" | sudo tee -a "/etc/systemd/journald.conf" >/dev/null
	journalctl_reload=1
fi

# Apply journald changes by restarting it
if [ "$journalctl_reload" -eq 1 ]; then
	echo "Restarting systemd-journald"
	sudo systemctl restart systemd-journald
fi

# Set some developer friendly bash defaults
echo "Setting up bashrc"
tee -a >/dev/null ~/.bashrc << 'BASHRC'
# Enable vim mode in terminal by default
# You can disable this by running `set +o vi`
set -o vi
export EDITOR=vim
export VISUAL=vim
BASHRC

# Friendly default vim config
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

# Friendly default tmux config (in vim mode)
# Tmux is a terminal multiplexer that lets you open multiple terminal windows
# from a single terminal. Tmux runs its server so if your SSH session disconnects
# your tmux session stays alive in the background
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

echo "Creating \"enkrypt-api\" group"
sudo groupadd --system enkrypt-api

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

echo "Creating \"enkrypt-api\" user"
sudo adduser \
	--system \
	--no-create-home \
	--home /opt/enkrypt-api \
	--disabled-password \
	--disabled-login \
	--shell /usr/sbin/nologin \
	--ingroup enkrypt-api \
	enkrypt-api

echo "Adding \"promtail\" to \"systemd-journal\" group"
sudo usermod -aG systemd-journal promtail

echo "Adding \"ubuntu\" to \"node-exporter\" group"
sudo usermod -aG node-exporter ubuntu

echo "Adding \"ubuntu\" to \"promtail\" group"
sudo usermod -aG promtail ubuntu

echo "Adding \"ubuntu\" to \"enkrypt-api\" group"
sudo usermod -aG enkrypt-api ubuntu

echo "Creating \"/etc/promtail\" directory"
sudo mkdir /etc/promtail
sudo chown root:promtail /etc/promtail
sudo chmod 550 /etc/promtail

echo "Creating \"/etc/enkrypt-api\" directory"
sudo mkdir /etc/enkrypt-api
sudo chown root:enkrypt-api /etc/enkrypt-api
sudo chmod 550 /etc/enkrypt-api

echo "Creating \"/opt/enkrypt-api\" directory"
sudo mkdir /opt/enkrypt-api
sudo chown enkrypt-api:enkrypt-api /opt/enkrypt-api
sudo chmod 750 /opt/enkrypt-api

echo "Creating \"/opt/enkrypt-api/app\" directory"
sudo mkdir /opt/enkrypt-api/app
sudo chown enkrypt-api:enkrypt-api /opt/enkrypt-api/app
sudo chmod 750 /opt/enkrypt-api/app

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
echo "6809dd0b3ec45fd6e992c19071d6b5253aed3ead7bf0686885a51d85c6643c66 node_exporter-1.8.2.linux-amd64.tar.gz" | sha256sum -c
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
# can be filled in by userdata on instance launch

# eg http://172.31.19.01:3100
LOKI_URL=

# eg dev, prod, test
STAGE=

# eg enkrypt-api-dev, enkrypt-api-prod
ENKRYPT_API_DEPLOYMENT_NAME=

PROMTAIL_ENV

echo "Creating \"/etc/enkrypt-api/node.env\" file"
sudo tee /etc/enkrypt-api/node.env >/dev/null << 'NODE_ENVFILE'
# this file is sourced by enkrypt-api systemd services
# it defines the nodejs version to be targetted by nvm
# note that the node version must already be installed by the enkrypt-api
# users' nvm installation in order for the service to start with this
# nodejs version
#
NODE_VERSION=v23.7.0
NODE_ENVFILE
sudo chown root:ubuntu /etc/enkrypt-api/node.env
sudo chmod 640 /etc/enkrypt-api/node.env

echo "Creating \"/etc/enkrypt-api/app.env\" file"
sudo tee /etc/enkrypt-api/app.env >/dev/null << APP_ENVFILE
# contains enkrypt api app environment variables that are loaded by systemd
APP_ENVFILE
sudo chown root:ubuntu /etc/enkrypt-api/app.env
sudo chmod 640 /etc/enkrypt-api/app.env

echo "Installing nvm, nodejs, pnpm for enkrypt-api user"
sudo su -s /bin/bash enkrypt-api - << 'SETUP_NODEJS'
set -euo pipefail
cd /opt/enkrypt-api
touch .bashrc

echo "Downloading nvm install script"
curl -fLo nvm-install.sh https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh
echo "Verifying nvm install script"
# Hash obtained from "curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | sha256sum"
if [[ ! "$(echo "abdb525ee9f5b48b34d8ed9fc67c6013fb0f659712e401ecd88ab989b3af8f53 nvm-install.sh" | sha256sum -c)" ]]; then
	echo "nvm-install.sh failed sha256sum check"
	exit 1
fi
echo "Installing nvm"
bash < nvm-install.sh
rm nvm-install.sh
source /opt/enkrypt-api/.nvm/nvm.sh

echo "Installing nodejs v23.7.0"
nvm install v23.7.0
nvm alias default v23.7.0
nvm use default

echo "Installing pnpm via npm"
npm install -g pnpm@9.15.0

echo "Setting up pnpm"
pnpm setup
source /opt/enkrypt-api/.bashrc

echo "Installing pnpm via pnpm"
pnpm install -g pnpm@9.15.0

echo "Removing pnpm from npm"
npm remove -g pnpm
SETUP_NODEJS

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
        app: enkrypt-api
        hostname: ${HOSTNAME}
        enkrypt_api_deployment_name: ${ENKRYPT_API_DEPLOYMENT_NAME}
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: 'unit'
PROMTAIL_CONFIG

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

echo "Creating up \"enkrypt-api\" systemd service: \"/etc/systemd/system/enkrypt-api.service\""
sudo tee /etc/systemd/system/enkrypt-api.service >/dev/null << 'ENKRYPT_API_SERVICE'
# man systemd.unit
# man systemd.service
# man systemd.exec
# https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html
# https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html

[Unit]
Description=Enkrypt API
After=network.target
# https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html#StartLimitIntervalSec=interval
StartLimitBurst=10
StartLimitIntervalSec=30

[Service]
Type=simple
User=enkrypt-api
EnvironmentFile=/etc/enkrypt-api/node.env
EnvironmentFile=/etc/enkrypt-api/app.env
WorkingDirectory=/opt/enkrypt-api/app/current
ExecStart=/opt/enkrypt-api/.nvm/nvm-exec node /opt/enkrypt-api/app/current/build/main.js serve

# https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#Restart=
Restart=always
# https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#RestartSec=
RestartSec=2

# Protection

## Sandboxing

### Limit filesystem access

# Read-only filesystem
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#ProtectSystem=
ProtectSystem=strict

# No access to /home, /root and /run/user
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#ProtectHome=
ProtectHome=yes

# Redundant since ProtectSystem=strict already makes the filesystem read-only
# but makes our read paths explicit anyway
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#ReadWritePaths=
ReadOnlyPaths=/usr /bin /lib /lib64 /opt/enkrypt-api/app/current /opt/enkrypt-api/.nvm

# If write paths are needed:
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#ReadWritePaths=
# ReadWritePaths=/var/log/enkrypt-api

### Limit device access

# Have our own private /tmp not shared by any other services
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#PrivateTmp=
PrivateTmp=true

# Only allow access to certain pseudo devices like /dev/null, /dev/zero and /dev/random
# No block devices like /dev/sda, /dev/nvme0n1, /dev/mem, etc
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#PrivateDevices=
PrivateDevices=true

### Limit network access

# Restrict to only using IP networking protocols (no unix sockets)
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#RestrictAddressFamilies=
RestrictAddressFamilies=AF_INET AF_INET6

### Limit Kernal access

# Make some kernal variables read-only and others inaccessable
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#ProtectKernelTunables=
ProtectKernelTunables=true

# Don't allow loading kernal modules
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#ProtectKernelModules=
ProtectKernelModules=true

# Make cgroups read-only
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#ProtectControlGroups=
ProtectControlGroups=true

## Privileges

# Never let the process and its children escalate privileges
# https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#NoNewPrivileges=
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
ENKRYPT_API_SERVICE

echo "Creating up \"enkrypt-api-check-current-config\" systemd service: \"/etc/systemd/system/enkrypt-api-check-current-config.service\""
sudo tee /etc/systemd/system/enkrypt-api-check-current-config.service >/dev/null << 'ENKRYPT_API_CHECK_CURRENT_CONFIG_SERVICE'
[Unit]
Description=Checks the Enkrypt API configuration of the current deployment
After=network.target

[Service]
Type=oneshot
User=enkrypt-api
EnvironmentFile=/etc/enkrypt-api/node.env
EnvironmentFile=/etc/enkrypt-api/app.env
WorkingDirectory=/opt/enkrypt-api/app/current
ExecStart=/opt/enkrypt-api/.nvm/nvm-exec node /opt/enkrypt-api/app/current/build/main.js serve --config-check

ProtectSystem=strict
ProtectHome=yes
ReadOnlyPaths=/usr /bin /lib /lib64 /opt/enkrypt-api/app/current /opt/enkrypt-api/.nvm
PrivateTmp=true
PrivateDevices=true
RestrictAddressFamilies=none
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
NoNewPrivileges=true

ENKRYPT_API_CHECK_CURRENT_CONFIG_SERVICE

echo "Creating up \"enkrypt-api-check-next-config\" systemd service: \"/etc/systemd/system/enkrypt-api-check-next-config.service\""
sudo tee /etc/systemd/system/enkrypt-api-check-next-config.service >/dev/null << 'ENKRYPT_API_CHECK_NEXT_CONFIG_SERVICE'
[Unit]
Description=Checks the Enkrypt API configuration of the next deployment
After=network.target

[Service]
Type=oneshot
User=enkrypt-api
EnvironmentFile=/etc/enkrypt-api/node.env
EnvironmentFile=/etc/enkrypt-api/app.env
WorkingDirectory=/opt/enkrypt-api/app/next
ExecStart=/opt/enkrypt-api/.nvm/nvm-exec node /opt/enkrypt-api/app/next/build/main.js serve --config-check

ProtectSystem=strict
ProtectHome=yes
ReadOnlyPaths=/usr /bin /lib /lib64 /opt/enkrypt-api/app/current /opt/enkrypt-api/.nvm
PrivateTmp=true
PrivateDevices=true
RestrictAddressFamilies=none
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
NoNewPrivileges=true

ENKRYPT_API_CHECK_NEXT_CONFIG_SERVICE

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

# Setup symlinks for systemd administrators so they can get a better idea what's on the server & where the files are
echo "Setting up some symlinks to configurations, services and executables in /home/ubuntu/server"

if [ ! -e /home/ubuntu/server ]; then mkdir /home/ubuntu/server; fi

echo "Setting up /home/ubuntu/server/etc symlinks"
if [ ! -e /home/ubuntu/server/etc ]; then mkdir /home/ubuntu/server/etc; fi
ln -s /etc/promtail /home/ubuntu/server/etc/promtail || true
ln -s /etc/enkrypt-api /home/ubuntu/server/etc/enkrypt-api || true

echo "Setting up /home/ubuntu/server/etc-systemd-system symlinks"
if [ ! -e /home/ubuntu/server/etc-systemd-system ]; then mkdir /home/ubuntu/server/etc-systemd-system; fi
ln -s /etc/systemd/system/promtail.service /home/ubuntu/server/etc-systemd-system/promtail.service || true
ln -s /etc/systemd/system/node-exporter.service /home/ubuntu/server/etc-systemd-system/node-exporter.service || true
ln -s /etc/systemd/system/enkrypt-api.service /home/ubuntu/server/etc-systemd-system/enkrypt-api.service || true
ln -s /etc/systemd/system/enkrypt-api-check-current-config.service /home/ubuntu/server/etc-systemd-system/enkrypt-api-check-current-config.service || true
ln -s /etc/systemd/system/enkrypt-api-check-next-config.service /home/ubuntu/server/etc-systemd-system/enkrypt-api-check-next-config.service || true

echo "Setting up /home/ubuntu/server/usr-local-bin symlinks"
if [ ! -e /home/ubuntu/server/usr-local-bin ]; then mkdir /home/ubuntu/server/usr-local-bin; fi
ln -s /usr/local/bin/promtail /home/ubuntu/server/usr-local-bin/promtail || true
ln -s /usr/local/bin/node-exporter /home/ubuntu/server/usr-local-bin/node-exporter || true

echo "Setting up /home/ubuntu/server/opt symlinks"
if [ ! -e /home/ubuntu/server/opt ]; then mkdir /home/ubuntu/server/opt; fi
ln -s /opt/enkrypt-api /home/ubuntu/server/opt/enkrypt-api || true

# Used to make sure we don't accidentally deploy to the wrong servers
echo "Creating server-type-identifier file"
tee /home/ubuntu/server-type-identifier >/dev/null << 'IDENTIFIER'
enkrypt-api-api
IDENTIFIER

chmod 440 /home/ubuntu/server-type-identifier

echo "Setting up readme"

README_TEXT=$(cat << 'README'
# Enkrypt API server

## This server contains

- Prometheus Node Exporter: installed manually from binary release (for exporting server metrics for collection via scraping by Prometheus, for monitoring and alerting in Grafana)
- Promtail: installed manually from binary release (for scraping logs and sending them to Loki for log aggregation and querying in Grafana)
- NVM, NodeJS & PNPM (for running the Enkrypt API server)

## Running the API

The API is ran by a systemd service named "enkrypt-api".

The API codebase will be in the /opt/enkrypt-api/app/current directory.

Environment variables are loaded from /etc/enkrypt-api/app.env.

The NodeJS version is specified in /etc/enkrypt-api/node.env and must already be installed for the enkrypt-api user via nvm.

## Updating the server

There are two ways to deploy the Enkrypt API server.

1. Fast: Building the codebase locally, uploading it to an existing Enkrypt API servers via SCP and SSH and restarting the API service.
2. Slow: Building and deploying a new EC2 AMI, updating the Enkrypt API EC2 Launch Template to use the new AMI, and refreshing the Enkrypt API Auto Scaling group.

## Getting started

After executing the setup script follow these steps to finish setting up the server.

These steps can be executed as part of a userdata script when the server is deployed via AutoScaling groups.

1. Restart the server
  [ ] `sudo reboot`
2. Setup api environment variables
  [ ] /etc/enkrypt-api/app.env
3. Upload, install dependencies, build and start the the api
  [ ] Run the deploy script `./scripts/deploy-api.sh`, specifying your jump host / bastion server if applicable, and the target server
4. Setup and attach a Security Group to this Load Balancer Server
  [ ] Whitelist egress to the Loki Security Group on port 3100 (make sure to whitelist ingress in the Loki Security Group if not already)
  [ ] Whitelist ingress from the Prometheus Security Group to Node Exporter on port 9100 (make sure to whitelist egress in the Prometheus Security Group if not already)
  [ ] Whitelist ingress from the LoadBalancer Security Group to the application stats on port 8080
5. Attach the new Security Group to the server and remove the Security Group allowing http/s egress
  [ ] Remove the Security Group allowing http/s egress from this EC2 instance
  [ ] Attach your new Security Group to this EC2 instance
6. Configure Promtail
  [ ] fill in the environment variables in /etc/promtail/env
7. Enable and start the Promtail service
  [ ] sudo systemctl enable promtail
  [ ] sudo systemctl start promtail
  [ ] sudo systemctl status promtail
8. Set tags on the EC2 instance for monitoring and billing purposes. The tags will be detected by the monitoring system (Prometheus) and tags preceeded by enkryptapi: will be turned into labels on the metrics.
  [ ] Name: enkrypt-api-(dev|prod|test)-api
  [ ] enkryptapi:stage=dev|prod|test
  [ ] enkryptapi:app=enkrypt-api
  [ ] enkryptapi:enkrypt_api_deployment_name=enkrypt-api-(dev|prod|test)
  [ ] prom:exporter:node=9100
9. Restart the server
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

# Print the readme
echo "$README_TEXT"

echo "Finished setup script"
