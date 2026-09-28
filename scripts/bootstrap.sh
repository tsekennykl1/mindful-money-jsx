#!/usr/bin/env bash
# Mindful Money frontend bootstrap — runs on EC2 (first boot / user-data, or
# every deploy via SSM from .github/workflows/deploy.yml).
#
#   nginx  :80   /mindful-money/  ->  app :3001  (PM2, TanStack Start server)
#
# The app is served from a folder on the shared hostname, so the snippet below
# is dropped into whichever nginx server block already owns port 80 — your other
# site keeps serving "/" untouched. HTTPS terminates upstream (ALB/CloudFront).
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
APP_BASE_PATH="${APP_BASE_PATH:-/mindful-money}"   # URL folder; "/" = whole site
SVC_USER="${SVC_USER:-mindfulmoney}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SERVER_NAME="${SERVER_NAME:-_}"          # only used if this app owns port 80
KEEP_RELEASES="${KEEP_RELEASES:-5}"
NGINX_ROOT="${NGINX_ROOT:-/etc/nginx}"   # override only for tests
export AWS_DEFAULT_REGION="$AWS_REGION"

# Normalise the URL folder: "" when the app owns the site root, otherwise
# "/mindful-money" (no trailing slash) plus "/mindful-money/" for locations.
BASE_PATH="${APP_BASE_PATH%/}"
BASE_PATH="${BASE_PATH#/}"
BASE_PATH="/${BASE_PATH}"
[ "$BASE_PATH" = "/" ] && BASE_PATH=""
URL_PATH="${BASE_PATH}/"
UPSTREAM="${APP_NAME//-/_}_app"
NGINX_CONF_D="$NGINX_ROOT/conf.d"
SNIPPET_DIR="$NGINX_ROOT/snippets"
INCLUDE_LINE="include $SNIPPET_DIR/${APP_NAME}-location.conf;"

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
# Pin the interpreter to the Node verified above: a PM2 daemon started long ago
# otherwise keeps forking the app with whatever old Node it was launched with.
NODE_BIN="$(command -v node)"
cat > "$APP_ROOT/ecosystem.config.cjs" <<EOF
// Loads $APP_ROOT/.env (if present) into the app's environment. Done here rather
// than with node's --env-file flag so it works on any Node the host may have.
const fs = require("fs");
const ENV_FILE = "$APP_ROOT/.env";
const extra = {};
if (fs.existsSync(ENV_FILE)) {
  const unquote = (v) => {
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  };
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) extra[line.slice(0, i).trim()] = unquote(line.slice(i + 1));
  }
}
module.exports = {
  apps: [{
    name: "$APP_NAME",
    cwd: "$APP_ROOT/current",
    script: ".output/server/index.mjs",
    interpreter: "$NODE_BIN",
    env: { ...extra, NODE_ENV: "production", PORT: "$APP_PORT", HOST: "127.0.0.1" },
    max_memory_restart: "400M",
    autorestart: true,
  }],
};
EOF
chown "$SVC_USER:$SVC_USER" "$APP_ROOT/ecosystem.config.cjs"

SVC_HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)"
run_pm2() { sudo -u "$SVC_USER" -H env PATH="$PATH" PM2_HOME="$SVC_HOME/.pm2" "$PM2_BIN" "$@"; }

# Start a fresh daemon so the app is forked by the Node we just verified.
run_pm2 kill >/dev/null 2>&1 || true
run_pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
run_pm2 start "$APP_ROOT/ecosystem.config.cjs"
run_pm2 save
# Start PM2 (and the app) on reboot.
env PATH="$PATH" "$PM2_BIN" startup systemd -u "$SVC_USER" --hp "$SVC_HOME" >/dev/null

# ── nginx: publish the app under ${URL_PATH} on port 80 ──────
# Files we manage ourselves:
#   $NGINX_ROOT/conf.d/<app>-upstream.conf   (http level: the backend address)
#   $NGINX_ROOT/snippets/<app>-location.conf (server level: the location blocks)
# The snippet is then included by whichever server block already serves :80, so
# the app shares the hostname with your other site instead of replacing it.
mkdir -p "$SNIPPET_DIR"
BACKUP_TS="$(date +%s)"
backup() { [ -f "$1" ] && cp -a "$1" "$1.bak.$BACKUP_TS" || true; }

# An older version of this script wrote one file holding both the upstream and a
# server block. Kept around, its upstream would now be declared twice, so retire
# anything we used to manage (a backup is written next to it first).
for legacy in "$NGINX_CONF_D/${APP_NAME}.conf" \
              "$NGINX_ROOT/sites-available/${APP_NAME}.conf" \
              "$NGINX_ROOT/sites-enabled/${APP_NAME}.conf"; do
  if [ -e "$legacy" ] || [ -L "$legacy" ]; then
    backup "$legacy"
    rm -f "$legacy"
  fi
done

backup "$NGINX_CONF_D/${APP_NAME}-upstream.conf"
cat > "$NGINX_CONF_D/${APP_NAME}-upstream.conf" <<EOF
# Managed by ${APP_NAME} bootstrap.sh — backend address for the location snippet.
upstream ${UPSTREAM} {
    server 127.0.0.1:${APP_PORT};
    keepalive 32;
}
EOF

REDIRECT_LINE=""
if [ -n "$BASE_PATH" ]; then
  REDIRECT_LINE="location = ${BASE_PATH} { return 301 ${URL_PATH}; }"
fi

backup "$SNIPPET_DIR/${APP_NAME}-location.conf"
cat > "$SNIPPET_DIR/${APP_NAME}-location.conf" <<EOF
# Managed by ${APP_NAME} bootstrap.sh — include this inside a server block.
${REDIRECT_LINE}

location ${URL_PATH}assets/ {
    proxy_pass http://${UPSTREAM};
    proxy_set_header Host \$host;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location ${URL_PATH} {
    proxy_pass http://${UPSTREAM};
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    # Keep the upstream scheme (https from ALB/CloudFront) if provided.
    proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
    proxy_read_timeout 60s;
}
EOF

# Candidate site files: every enabled config (plus the built-in one) that has a
# server block listening on 80, excluding our own managed files.
collect_sites() {
  for f in "$NGINX_ROOT"/sites-enabled/* "$NGINX_ROOT"/conf.d/*.conf "$NGINX_ROOT"/nginx.conf; do
    [ -f "$f" ] || continue
    rp="$(realpath "$f" 2>/dev/null || printf '%s' "$f")"
    case "$rp" in *"${APP_NAME}"*) continue ;; esac
    grep -Eq '^[[:space:]]*listen[^;]*[[:space:]:]80([[:space:];]|$)' "$rp" && printf '%s\n' "$rp"
  done
}
mapfile -t SITE_FILES < <(collect_sites | awk '!seen[$0]++')

ATTACHED=0
for f in "${SITE_FILES[@]}"; do
  if grep -qF "$INCLUDE_LINE" "$f"; then
    ATTACHED=$((ATTACHED + 1))
    continue
  fi
  backup "$f"
  # Add it to every server block in the file, not just the first: a config often
  # holds a plain-HTTP redirect block before the block that really serves traffic.
  awk -v inc="$INCLUDE_LINE" '
    /^[[:space:]]*server[[:space:]]*\{/ { print; print "    " inc; next }
    { print }
  ' "$f" > "$f.tmp.$$" && mv "$f.tmp.$$" "$f"
  chmod --reference="$f.bak.$BACKUP_TS" "$f" 2>/dev/null || true
  ATTACHED=$((ATTACHED + 1))
done

if [ "$ATTACHED" -eq 0 ]; then
  # Nothing else on :80 — this app owns the port, so write its own server block.
  if [ -d "$NGINX_ROOT/sites-available" ]; then
    NGINX_CONF="$NGINX_ROOT/sites-available/${APP_NAME}.conf"
    ln -sfn "$NGINX_CONF" "$NGINX_ROOT/sites-enabled/${APP_NAME}.conf"
  else
    NGINX_CONF="$NGINX_CONF_D/${APP_NAME}.conf"
  fi
  backup "$NGINX_CONF"
  cat > "$NGINX_CONF" <<EOF
# Managed by ${APP_NAME} bootstrap.sh — HTTPS terminates upstream (ALB/CloudFront).
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    client_max_body_size 10m;

    ${INCLUDE_LINE}
}
EOF
fi

if ! nginx -t; then
  echo "nginx -t failed — restoring the configs we touched" >&2
  for f in "${SITE_FILES[@]}"; do
    [ -f "$f.bak.$BACKUP_TS" ] && cp -a "$f.bak.$BACKUP_TS" "$f"
  done
  nginx -t || true
  exit 1
fi
systemctl enable nginx
systemctl reload nginx 2>/dev/null || systemctl restart nginx

# ── Health check ─────────────────────────────────────────────
APP_URL="http://127.0.0.1:${APP_PORT}${URL_PATH}"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "$APP_URL"; then break; fi
  sleep 2
done
if ! curl -fsS -o /dev/null "$APP_URL"; then
  run_pm2 logs "$APP_NAME" --lines 80 --nostream || true
  exit 1
fi
# Probe every hostname this box serves: each is a separate server block, and the
# one in front of the app (CloudFront/ALB) may be any of them. 200 means the
# answer really came from this app, not from the site behind it.
CHECK_HOSTS="localhost"
for f in "${SITE_FILES[@]}"; do
  while read -r h; do
    [ -n "$h" ] && [ "$h" != "_" ] && CHECK_HOSTS="$CHECK_HOSTS $h"
  done < <(grep -hoE 'server_name[^;]+;' "$f" | sed -e 's/server_name//' -e 's/;//' | tr -s ' \t' '\n')
done
for h in $CHECK_HOSTS; do
  code="$(curl -sS -o /dev/null -m 15 -w '%{http_code}' -H "Host: $h" "http://127.0.0.1${URL_PATH}" || printf '000')"
  if [ "$code" = "200" ]; then
    echo "ok   : http://$h${URL_PATH}"
  else
    echo "WARN : Host: $h returned $code for ${URL_PATH}"
  fi
done

# ── Prune old releases ───────────────────────────────────────
ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

echo "Deployed $APP_NAME release $RELEASE"
echo "  app    : http://127.0.0.1:${APP_PORT}${URL_PATH}"
echo "  public : http://<your-domain>${URL_PATH}"
