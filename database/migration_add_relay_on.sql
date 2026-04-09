-- 已有库升级：设备继电器状态（由 MQTT report 更新）
ALTER TABLE devices ADD COLUMN relay_on TINYINT(1) NULL COMMENT '最近一次上报的继电器状态' AFTER fw_version;
