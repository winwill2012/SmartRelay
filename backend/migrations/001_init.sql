-- SmartRelay schema per 协议标准.md §4 + command_records §5.7
-- Charset utf8mb4, InnoDB, UTC DATETIME

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS app_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  wx_openid VARCHAR(64) NOT NULL,
  wx_unionid VARCHAR(64) NULL,
  nickname VARCHAR(64) NULL,
  avatar_url VARCHAR(512) NULL,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  UNIQUE KEY uk_wx_openid (wx_openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS devices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  device_sn VARCHAR(32) NOT NULL,
  mqtt_password VARCHAR(128) NOT NULL,
  relay_state TINYINT NOT NULL DEFAULT 0,
  online TINYINT NOT NULL DEFAULT 0,
  last_seen_at DATETIME NULL,
  owner_user_id CHAR(36) NULL,
  remark_name VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_device_sn (device_sn),
  KEY idx_owner (owner_user_id),
  CONSTRAINT fk_devices_owner FOREIGN KEY (owner_user_id) REFERENCES app_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_operation_logs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  source VARCHAR(16) NOT NULL,
  action VARCHAR(32) NOT NULL,
  cmd_id CHAR(36) NULL,
  detail_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_device_id (device_id),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_schedules (
  id CHAR(36) NOT NULL PRIMARY KEY,
  device_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  cron_expr VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_device_schedules_device (device_id),
  CONSTRAINT fk_schedules_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS command_records (
  cmd_id CHAR(36) NOT NULL PRIMARY KEY,
  device_id CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL,
  payload_json JSON NULL,
  created_at DATETIME NOT NULL,
  ack_at DATETIME NULL,
  KEY idx_command_device (device_id),
  KEY idx_command_status_created (status, created_at),
  CONSTRAINT fk_cmd_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
