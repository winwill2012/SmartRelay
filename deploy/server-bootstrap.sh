#!/usr/bin/env bash
# 在服务器 root 下执行：SmartRelay 后端 + systemd（MySQL/EMQX 已存在）
set -euo pipefail

MYSQL_ROOT_PW='314159!@#$%'
APP_USER_PW='314159!@$%^'
APP_DIR=/opt/smart-relay
REPO_URL="${SMARTRELAY_REPO_URL:-https://github.com/winwill2012/SmartRelay.git}"

docker exec -i mysql8 mysql -uroot -p"${MYSQL_ROOT_PW}" <<EOSQL
CREATE DATABASE IF NOT EXISTS SmartRelay DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'SmartRelay'@'%' IDENTIFIED BY '${APP_USER_PW}';
ALTER USER 'SmartRelay'@'%' IDENTIFIED BY '${APP_USER_PW}';
GRANT ALL PRIVILEGES ON SmartRelay.* TO 'SmartRelay'@'%';
FLUSH PRIVILEGES;
EOSQL

mkdir -p "$APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin && git -C "$APP_DIR" reset --hard origin/master
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR/backend"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip wheel
pip install -r requirements.txt

JWT_SEC=$(openssl rand -hex 24)

cat > /opt/smart-relay/backend/.env <<ENVEOF
APP_NAME=SmartRelay API
PUBLIC_BASE_URL=https://iot.welinklab.com/smart-relay
LISTEN_HOST=127.0.0.1
LISTEN_PORT=8000

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=SmartRelay
MYSQL_PASSWORD=${APP_USER_PW}
MYSQL_DATABASE=SmartRelay

JWT_SECRET=${JWT_SEC}

MQTT_HOST=127.0.0.1
MQTT_PORT=1883
MQTT_USERNAME=SmartRelay
MQTT_PASSWORD=${APP_USER_PW}
MQTT_CLIENT_ID=sr_backend_v1_prod

DEVICE_OFFLINE_SECONDS=45
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=admin123
WECHAT_APP_ID=
WECHAT_SECRET=
UPLOAD_DIR=/var/lib/smart-relay/uploads
ENVEOF

mkdir -p /var/lib/smart-relay/uploads
chmod 755 /var/lib/smart-relay/uploads

docker exec -i mysql8 mysql -uSmartRelay -p"${APP_USER_PW}" SmartRelay < "$APP_DIR/database/init.sql"

cat > /etc/systemd/system/smartrelay-api.service <<'UNIT'
[Unit]
Description=SmartRelay FastAPI (uvicorn)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/smart-relay/backend
EnvironmentFile=/opt/smart-relay/backend/.env
ExecStart=/opt/smart-relay/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips="*"
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable smartrelay-api
systemctl restart smartrelay-api
sleep 2
systemctl --no-pager status smartrelay-api || true
curl -sS http://127.0.0.1:8000/health && echo

if [[ -f "$APP_DIR/deploy/iot.welinklab.com.conf" ]]; then
  cp -a "$APP_DIR/deploy/iot.welinklab.com.conf" /etc/nginx/conf.d/iot.welinklab.com.conf
  nginx -t
  systemctl reload nginx
  echo "nginx reloaded (smart-relay + EMQX / + /live)"
fi
