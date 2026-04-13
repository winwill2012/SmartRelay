#include "sr_schedule.h"
#include "sr_nvs.h"
#include "sr_relay.h"
#include "cJSON.h"
#include "esp_log.h"
#include <cstdio>
#include <cstring>
#include <ctime>

static const char *TAG = "sr_schedule";

/** 本地日历分钟的稳定桶，用于同一条定时在同分钟内只执行一次（主循环约每 10s 会检查一次） */
static int64_t local_minute_bucket(struct tm *ti) {
  struct tm t = *ti;
  time_t tt = mktime(&t);
  if (tt == (time_t)-1) return 0;
  return (int64_t)(tt / 60);
}

#define SR_SCHED_FIRED_MAX 12
static int64_t s_fired_min_bucket = -1;
static int s_fired_count = 0;
static int64_t s_fired_sids[SR_SCHED_FIRED_MAX];

static bool already_fired_this_minute(int64_t minb, int64_t sid) {
  if (minb != s_fired_min_bucket) {
    s_fired_min_bucket = minb;
    s_fired_count = 0;
    return false;
  }
  for (int i = 0; i < s_fired_count; i++) {
    if (s_fired_sids[i] == sid) return true;
  }
  return false;
}

static void record_fired_this_minute(int64_t minb, int64_t sid) {
  if (minb != s_fired_min_bucket) {
    s_fired_min_bucket = minb;
    s_fired_count = 0;
  }
  if (s_fired_count >= SR_SCHED_FIRED_MAX) return;
  s_fired_sids[s_fired_count++] = sid;
}

static char s_json[8192] = "[]";
static int64_t s_rev;

void sr_schedule_load(void) {
  /* 勿在栈上申请 sizeof(s_json)（8KB），主任务栈约 3–4KB，会栈溢出 */
  if (!sr_nvs_get_str("sched_json", s_json, sizeof(s_json))) {
    strcpy(s_json, "[]");
  }
  int64_t r = 0;
  if (sr_nvs_get_i64("sch_rev", &r)) s_rev = r;
  else s_rev = 0;
}

void sr_schedule_save_json(const char *json, int64_t revision) {
  if (json) {
    strncpy(s_json, json, sizeof(s_json) - 1);
    s_json[sizeof(s_json) - 1] = '\0';
  }
  s_rev = revision;
  sr_nvs_set_str("sched_json", s_json);
  sr_nvs_set_i64("sch_rev", revision);
}

const char *sr_schedule_json_ptr(void) { return s_json; }
int64_t sr_schedule_revision(void) { return s_rev; }

static bool time_str_match(const char *tl, const char *cur5) {
  return tl && strncmp(tl, cur5, 5) == 0;
}

bool sr_schedule_tick(bool *out_from_sched, int64_t *out_sched_id, char *action_out, size_t action_sz) {
  if (out_from_sched) *out_from_sched = false;
  if (out_sched_id) *out_sched_id = 0;
  if (action_out && action_sz) action_out[0] = '\0';

  time_t now = time(nullptr);
  struct tm ti;
  if (!localtime_r(&now, &ti)) return false;

  cJSON *root = cJSON_Parse(s_json);
  if (!root || !cJSON_IsArray(root)) {
    if (root) cJSON_Delete(root);
    return false;
  }

  char curTime[6];
  snprintf(curTime, sizeof(curTime), "%02d:%02d", ti.tm_hour, ti.tm_min);
  int wday = ti.tm_wday;
  int mday = ti.tm_mday;

  cJSON *item = nullptr;
  cJSON_ArrayForEach(item, root) {
    if (!cJSON_IsObject(item)) continue;
    cJSON *en = cJSON_GetObjectItem(item, "enabled");
    if (!cJSON_IsBool(en) || !cJSON_IsTrue(en)) continue;

    const char *rt = "once";
    cJSON *jr = cJSON_GetObjectItem(item, "repeat_type");
    if (cJSON_IsString(jr) && jr->valuestring) rt = jr->valuestring;

    const char *tl = "";
    cJSON *jt = cJSON_GetObjectItem(item, "time_local");
    if (cJSON_IsString(jt) && jt->valuestring) tl = jt->valuestring;
    if (!time_str_match(tl, curTime)) continue;

    if (!strcmp(rt, "daily") || !strcmp(rt, "once")) {
    } else if (!strcmp(rt, "weekly")) {
      bool hit = false;
      cJSON *wd = cJSON_GetObjectItem(item, "weekdays");
      if (cJSON_IsArray(wd)) {
        cJSON *d = nullptr;
        cJSON_ArrayForEach(d, wd) {
          if (cJSON_IsNumber(d) && (int)d->valuedouble == wday) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) continue;
    } else if (!strcmp(rt, "monthly")) {
      bool hit = false;
      cJSON *mdays = cJSON_GetObjectItem(item, "monthdays");
      if (cJSON_IsArray(mdays)) {
        cJSON *d = nullptr;
        cJSON_ArrayForEach(d, mdays) {
          if (cJSON_IsNumber(d) && (int)d->valuedouble == mday) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) continue;
    } else
      continue;

    int64_t sid = 0;
    cJSON *jid = cJSON_GetObjectItem(item, "id");
    if (cJSON_IsNumber(jid)) sid = (int64_t)jid->valuedouble;

    int64_t minb = local_minute_bucket(&ti);
    if (already_fired_this_minute(minb, sid)) continue;

    const char *act = "off";
    cJSON *ja = cJSON_GetObjectItem(item, "action");
    if (cJSON_IsString(ja) && ja->valuestring) act = ja->valuestring;
    sr_relay_set(!strcmp(act, "on"));

    record_fired_this_minute(minb, sid);

    ESP_LOGI(TAG, "fired id=%lld time=%s action=%s", (long long)sid, curTime, act);

    if (out_from_sched) *out_from_sched = true;
    if (out_sched_id) *out_sched_id = sid;
    if (action_out && action_sz) {
      strncpy(action_out, act, action_sz - 1);
      action_out[action_sz - 1] = '\0';
    }

    if (!strcmp(rt, "once")) {
      cJSON_ReplaceItemInObject(item, "enabled", cJSON_CreateFalse());
      char *upd = cJSON_PrintUnformatted(root);
      if (upd) {
        strncpy(s_json, upd, sizeof(s_json) - 1);
        s_json[sizeof(s_json) - 1] = '\0';
        cJSON_free(upd);
        sr_nvs_set_str("sched_json", s_json);
      }
    }

    cJSON_Delete(root);
    return true;
  }

  cJSON_Delete(root);
  return false;
}
