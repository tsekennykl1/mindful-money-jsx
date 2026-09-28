#!/usr/bin/env bash
# Mindful Money frontend bootstrap — runs on EC2 (first boot / user-data, or
# every deploy via SSM from .github/workflows/deploy.yml).
#
#   nginx  :80   -> reverse proxy (HTTPS terminated upstream by ALB/CloudFront)
#   app    :3001 -> TanStack Start Node server, managed by PM2
#
# Idempotent — safe to re-run. Usage:
#   S3_BUCKET=... S3_PREFIX=mindful-money RELEASE=<sha> AWS_REGION=ap-east-1 ./bootstrap.sh
# RELEASE is optional; defaults to s3://$S3_BUCKET/$S3_PREFIX/current/release.txt
set -euxo pipefail

# ── Configuration ─────────────────────────────────────────────
S3_BUCKET="${S3_BUCKET:-s3general-148535751717-ap-east-1-an}"
S3_PREFIX="${S3_PREFIX:-mindful-money}"
AWS_REGION="${AWS_REGION:-ap-east-1}"
APP_NAME="${APP_NAME:-mindful-money}"
APP_ROOT="${APP_ROOT:-/opt/mindful-money}"
APP_PORT="${APP_PORT:-3001}"
SVC_USER="${SVC_USER:-mindfulmoney}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SERVER_NAME="${SERVER_NAME:-_}"          # e.g. "www.example.com"; "_" = default server
KEEP_RELEASES="${KEEP_RELEASES:-5}"
export AWS_DEFAULT_REGION="$AWS_REGION"

# ── Package manager (AL2023 = dnf, Ubuntu = apt-get) ─────────
if command -v dnf >/dev/null 2>&1; then
  PKG_MGR="dnf"
elif command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  PKG_MGR="apt-get"
else
  echo "No supported package manager (dnf/apt-get)" >&2; exit 1
fi

pkg_install() {
  if [ "$PKG_MGR" = "dnf" ]; then dnf install -y --allowerasing "$@"
  else apt-get update -y && apt-get install -y --no-install-recommends "$@"; fi
}

# ── System packages ──────────────────────────────────────────
for cmd in unzip curl nginx; do
  command -v "$cmd" >/dev/null 2>&1 || pkg_install unzip curl nginx
done
if ! command -v aws >/dev/null 2>&1; then
  if [ "$PKG_MGR" = "apt-get" ]; then pkg_install awscli || true; fi
  if ! command -v aws >/dev/null 2>&1; then
    curl -sSfL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
    unzip -qo /tmp/awscliv2.zip -d /tmp && /tmp/aws/install --update
  fi
fi

# ── Node.js + PM2 ────────────────────────────────────────────
NODE_OK=false
if command -v node >/dev/null 2>&1; then
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] && NODE_OK=true
fi
if [ "$NODE_OK" = false ]; then
  if [ "$PKG_MGR" = "dnf" ]; then
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    dnf install -y nodejs
  else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
fi
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
PM2_BIN="$(command -v pm2)"

# ── SSM Agent (so future deploys never stall) ────────────────
if systemctl list-unit-files | grep -q amazon-ssm-agent; then
  systemctl enable --now amazon-ssm-agent || true
elif command -v snap >/dev/null 2>&1 && snap list amazon-ssm-agent >/dev/null 2>&1; then
  snap start amazon-ssm-agent || true
fi

# ── Service user & folders ───────────────────────────────────
id "$SVC_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$SVC_USER"
mkdir -p "$APP_ROOT/releases"

# ── Fetch release ────────────────────────────────────────────
if [ -z "${RELEASE:-}" ]; then
  RELEASE="$(aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/current/release.txt" - | tr -d '[:space:]')"
fi
[ -n "$RELEASE" ] || { echo "No release to deploy" >&2; exit 1; }

REL_DIR="$APP_ROOT/releases/$RELEASE"
rm -rf "$REL_DIR.tmp" && mkdir -p "$REL_DIR.tmp"
aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/releases/$RELEASE/mindful-money.zip" /tmp/mindful-money.zip
unzip -qo /tmp/mindful-money.zip -d "$REL_DIR.tmp"
rm -f /tmp/mindful-money.zip
test -f "$REL_DIR.tmp/.output/server/index.mjs"
rm -rf "$REL_DIR" && mv "$REL_DIR.tmp" "$REL_DIR"

# Optional runtime env file (server-only secrets), kept outside releases.
touch "$APP_ROOT/.env"
chmod 640 "$APP_ROOT/.env"

ln -sfn "$REL_DIR" "$APP_ROOT/current"
chown -R "$SVC_USER:$SVC_USER" "$APP_ROOT"

# ── PM2 app (port 3001) ──────────────────────────────────────
cat > "$APP_ROOT/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [{
    name: "${APP_NAME}",
    cwd: "${APP_ROOT}/current",
    script: ".output/server/index.mjs",
    node_args: "--env-file-if-exists=${APP_ROOT}/.env",
    env: { NODE_ENV: "production", PORT: "${APP_PORT}", HOST: "127.0.0.1" },
    max_memory_restart: "400M",
    autorestart: true,
  }],
};
EOF
chown "$SVC_USER:$SVC_USER" "$APP_ROOT/ecosystem.config.cjs"

SVC_HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)"
run_pm2() { sudo -u "$SVC_USER" -H env PATH="$PATH" PM2_HOME="$SVC_HOME/.pm2" "$PM2_BIN" "$@"; }

run_pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
run_pm2 start "$APP_ROOT/ecosystem.config.cjs"
run_pm2 save
# Start PM2 (and the app) on reboot.
env PATH="$PATH" "$PM2_BIN" startup systemd -u "$SVC_USER" --hp "$SVC_HOME" >/dev/null

# ── nginx :80 -> :3001 (create or overwrite our own site file) ──
if [ -d /etc/nginx/sites-available ]; then
  NGINX_CONF="/etc/nginx/sites-available/${APP_NAME}.conf"
  ln -sfn "$NGINX_CONF" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
  rm -f /etc/nginx/sites-enabled/default
else
  NGINX_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"
fi
[ -f "$NGINX_CONF" ] && cp "$NGINX_CONF" "$NGINX_CONF.bak.$(date +%s)"

cat > "$NGINX_CONF" <<EOF
# Managed by mindful-money bootstrap.sh — HTTPS terminates upstream (ALB/CloudFront).
upstream ${APP_NAME//-/_}_app {
    server 127.0.0.1:${APP_PORT};
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    client_max_body_size 10m;

    location = /nginx-health {
        access_log off;
        return 200 "ok\n";
    }

    # Hashed build assets — cache aggressively.
    location /assets/ {
        proxy_pass http://${APP_NAME//-/_}_app;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://${APP_NAME//-/_}_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        # Keep the upstream scheme (https from ALB/CloudFront) if provided.
        proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_read_timeout 60s;
    }
}
EOF

# AL2023's default nginx.conf has its own "default_server" on :80 — only
# drop it if it would collide and we are the default server.
if [ "$SERVER_NAME" = "_" ] && [ -f /etc/nginx/nginx.conf ] && grep -q "listen\s*80 default_server" /etc/nginx/nginx.conf; then
  cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%s)
  sed -i 's/listen\s*80 default_server;/listen 80;/; s/listen\s*\[::\]:80 default_server;/listen [::]:80;/' /etc/nginx/nginx.conf
  sed -i "s/listen 80;\n    listen \[::\]:80;/&/" "$NGINX_CONF"
  sed -i 's/^    listen 80;$/    listen 80 default_server;/; s/^    listen \[::\]:80;$/    listen [::]:80 default_server;/' "$NGINX_CONF"
fi

nginx -t
systemctl enable nginx
systemctl reload nginx 2>/dev/null || systemctl restart nginx

# ── Health check ─────────────────────────────────────────────
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${APP_PORT}/"; then break; fi
  sleep 2
done
curl -fsS -o /dev/null "http://127.0.0.1:${APP_PORT}/" || { run_pm2 logs "$APP_NAME" --lines 80 --nostream || true; exit 1; }
curl -fsS -o /dev/null -H "Host: ${SERVER_NAME/_/localhost}" "http://127.0.0.1/" || echo "WARN: nginx on :80 did not return 2xx"

# ── Prune old releases ───────────────────────────────────────
ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

echo "Deployed $APP_NAME release $RELEASE (nginx :80 -> :${APP_PORT})"
