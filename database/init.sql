-- SmartRelay v1 初始化脚本（与《协议标准.md》附录 A 一致）
-- 数据库：见项目根目录 resource.md

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  openid VARCHAR(64) NOT NULL UNIQUE,
  unionid VARCHAR(64) NULL,
  nickname VARCHAR(64) NULL,
  avatar_url VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  INDEX idx_users_last_login (last_login_at)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id VARCHAR(32) NOT NULL UNIQUE,
  device_secret_hash VARCHAR(255) NOT NULL,
  mac VARCHAR(17) NULL,
  fw_version VARCHAR(32) NULL,
  relay_on TINYINT(1) NULL COMMENT '最近一次上报的继电器状态',
  last_seen_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_devices_last_seen (last_seen_at)
);

CREATE TABLE IF NOT EXISTS user_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  remark VARCHAR(64) NOT NULL DEFAULT '',
  role ENUM('owner','shared') NOT NULL DEFAULT 'owner',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_user_device (user_id, device_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS schedules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  name VARCHAR(64) NULL,
  repeat_type ENUM('once','daily','weekly','monthly') NOT NULL,
  time_local TIME NOT NULL,
  weekdays JSON NULL,
  monthdays JSON NULL,
  action ENUM('on','off') NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (device_id) REFERENCES devices(id),
  INDEX idx_sched_device (device_id)
);

CREATE TABLE IF NOT EXISTS device_operation_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  source ENUM('user','admin','schedule','system') NOT NULL,
  action VARCHAR(64) NOT NULL,
  detail JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_logs_device_time (device_id, created_at),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE TABLE IF NOT EXISTS firmware_versions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  version VARCHAR(32) NOT NULL,
  file_url VARCHAR(512) NOT NULL,
  file_md5 CHAR(32) NOT NULL,
  file_size BIGINT NOT NULL,
  release_notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_fw_version (version)
);

SET FOREIGN_KEY_CHECKS = 1;

-- 默认管理员未在此插入（避免明文与脚本幂等）。任选其一：
-- 1) 启动后端一次：会写入 admin / admin123（见 backend app/seed.py）
-- 2) 执行：SR_MYSQL_PASS=... python database/seed_admin.py
