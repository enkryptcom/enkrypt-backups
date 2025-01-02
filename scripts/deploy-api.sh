#! /usr/bin/env bash

set -euo pipefail

print_help() {
	echo "Usage: $0 [options...] destination"
	echo ""
	echo "If new dependencies have been installed then the remote server will need"
	echo "outgoing HTTPS access to NPM. Otherwise, dependencies will be installed from"
	echo "the remote server's enkryt-api user's pnpm cache."
	echo ""
	echo "Positional arguments"
	echo "  destination        Target server to SSH into and deploy on"
	echo "                     Example: ubuntu@192.168.1.2"
	echo ""
	echo "Options:"
	echo "  --help             Show help"
	echo "  -J <destination>   SSH bastion/jump host to connect to -t through"
	echo "  --nvm-install      Install or reinstall the Node.js target version on the server"
	echo "                     (Only use if the server has connectivity to NodeJS' servers)"
	echo "  --build            Build the project on the server"
	echo "                     (Not recommended. You should build locally instead.)"
	echo ""
	echo "Examples:"
	echo "  $0 user@example.com                           Connect directly to 'example.com'"
	echo "  $0 -J jump@example.com user@example.com       Connect to 'example.com' via 'jump@example.com' bastion"
	echo "  $0 --nvm-install user@example.com             Install Node.js on 'example.com'"
}

ssh_options=""
scp_options=""
nvm_install_opt="false"
build_opt="false"
ssh_target=""

while [[ $# -gt 0 ]]; do
	case "$1" in
		--help)
			print_help >&1
			exit 0
			;;
		-J)
			if [[ -n "$2" && "$2" != -* ]]; then
				bastion_host="$2"
				ssh_options="-J $bastion_host"
				scp_options="-o ProxyJump=$bastion_host"
				shift 2
			else
				print_help >&2
				echo "" >&2
				echo "Error: Option '$1' requires a value." >&2
				exit 1
			fi
			;;
		--nvm-install)
			nvm_install_opt="true"
			shift
			;;
		--build)
			build_opt="true"
			shift
			;;
		*)
			if [[ "${1:0:1}" == "-" ]]; then
				print_help >&2
				echo "" >&2
				echo "Error: Unexpected argument '$1'" >&2
				exit 1
			else
				# destination should be the last argument
				ssh_target="$1"
				shift
				break;
			fi
			;;
	esac
done

# If there are still arguments left after setting ssh_target, error out.
if [[ $# -gt 0 ]]; then
  print_help >&2
	echo "" >&2
  echo "Error: Extra arguments: $@. Destination should be the last argument." >&2
  exit 1
fi

if [[ -z "${ssh_target}" ]]; then
	print_help >&2
	echo "" >&2
  echo "Destination is required." >&2
  exit 1
fi

echo "SSH options:         ${ssh_options}"
echo "SCP options:         ${scp_options}"
echo "Remote NVM install:  ${nvm_install_opt}"
echo "Remote Build:        ${build_opt}"
echo "SSH target:          ${ssh_target}"

# Verify that we're deploying to an actual enkrypt-api server
echo "Verifying remote server type..."
ssh -C ${ssh_options} $ssh_target << EOF
# Check server type before deployment
if grep -qx 'enkrypt-api-api' /home/ubuntu/server-type-identifier; then
    echo "Deploying to the correct server."
else
    echo "Error: incorrect server type."
    exit 1
fi
EOF

echo "Extracting version from package.json"

version="0.0.0"
if grep -q '"version":' package.json; then
  version=$(grep '"version":' package.json | awk -F '"' '{print $4}')
fi

echo "Version: $version"

if [ -f "./codebase.tar.gz" ]; then
	echo "Removing existing archive..."
	rm "./codebase.tar.gz"
fi

echo "Installing dependencies locally..."
pnpm install

echo "Removing existing local build..."
pnpm clean

echo "Rebuilding the codebase locally..."
pnpm build

# Create a tar.gz archive of the required files
echo "Archiving the codebase..."
tar -czf ./codebase.tar.gz \
	./package.json \
	./pnpm-lock.yaml \
	./tsconfig.json \
	./openapi.yaml \
	./.nvmrc \
	./config \
	./src \
	./public \
	./build

# Upload the archive to the server through the bastion host
echo "Uploading the archive to the server..."
scp -C ${scp_options} "./codebase.tar.gz" "${ssh_target}:/home/ubuntu/codebase.tar.gz"

# SSH into the server, remove existing version if it exists, unpack, install, build, and restart service
echo "Deploying the new version..."
ssh -C ${ssh_options} $ssh_target << EOF
set -euo pipefail

echo "Preparing to deploy version $version..."
if [ -d "/opt/enkrypt-api/app/$version.next" ]; then
	echo "Removing previous dirty deployment..."
	sudo rm -rf "/opt/enkrypt-api/app/$version.next"
fi
sudo mkdir "/opt/enkrypt-api/app/$version.next"
sudo mv "/home/ubuntu/codebase.tar.gz" "/opt/enkrypt-api/app/$version.next/codebase.tar.gz"

echo "Extracting the archive..."
sudo tar -xzf "/opt/enkrypt-api/app/$version.next/codebase.tar.gz" -C "/opt/enkrypt-api/app/$version.next"
sudo chown -R enkrypt-api:enkrypt-api "/opt/enkrypt-api/app/$version.next"

echo "Switching to enkrypt-api user and setting up the new version"
sudo -u enkrypt-api bash -c "
set -euo pipefail

source ~/.bashrc

cd '/opt/enkrypt-api/app/$version.next'

if [ "$nvm_install_opt" == 'true' ]; then
	echo 'Installing Node.js version'
	nvm install
fi

# echo 'Setting Node.js version'
nvm use

echo 'Installing dependencies'
pnpm install

if [ "$build_opt" == 'true' ]; then
	echo 'Building the project'
	pnpm build
fi
"

echo "Checking whether build succeded"
if [ ! -d "/opt/enkrypt-api/app/$version.next/build" ]; then
	echo "Build failed, aborting deployment"
	exit 1
fi

echo "Removing the archive..."
sudo rm "/opt/enkrypt-api/app/$version.next/codebase.tar.gz"

if [ -L "/opt/enkrypt-api/app/next" ]; then
	echo "Removing the existing next symlink..."
	sudo rm "/opt/enkrypt-api/app/next"
fi

echo "Linking next version for config checking"
sudo ln -s "/opt/enkrypt-api/app/$version.next" "/opt/enkrypt-api/app/next"

echo "Checking configuration for next deployment"
if ! sudo systemctl start enkrypt-api-check-next-config.service; then
  echo "Failed. Fetching logs..."

  # Fetch and log the last 100 lines from the service's journal
  journalctl -u enkrypt-api-check-next-config.service --since "1 minute ago" --no-pager | tail -n 300

	echo "Configuration check failed, aborting deployment"
	exit 1
fi

if [ -d "/opt/enkrypt-api/app/$version" ]; then
	echo "Backing up the current version..."
	if [ -d "/opt/enkrypt-api/app/$version.bak" ]; then
		echo "Removing the existing backup..."
		sudo rm -rf "/opt/enkrypt-api/app/$version.bak"
	fi
	sudo mv "/opt/enkrypt-api/app/$version" "/opt/enkrypt-api/app/$version.bak"
fi

echo "Committing the new version..."
sudo mv "/opt/enkrypt-api/app/$version.next" "/opt/enkrypt-api/app/$version"

if [ -L "/opt/enkrypt-api/app/current" ]; then
	echo "Removing the current symlink..."
	sudo rm "/opt/enkrypt-api/app/current"
fi

echo "Linking the new version..."
sudo ln -sf "/opt/enkrypt-api/app/$version" "/opt/enkrypt-api/app/current"

echo "Removing link to next version..."
sudo rm "/opt/enkrypt-api/app/next"

if ! systemctl is-enabled --quiet enkrypt-api.service; then
	echo "Enabling the api service"
	sudo systemctl enable enkrypt-api.service
fi

echo "Restarting the api service"
sudo systemctl restart enkrypt-api.service

echo "Deployment of version $version complete!"
EOF

echo "Removing the deployment archive..."
rm "codebase.tar.gz"

