#pragma once

#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void sr_schedule_load(void);
void sr_schedule_save_json(const char *json, int64_t revision);
const char *sr_schedule_json_ptr(void);
int64_t sr_schedule_revision(void);
/** 若本分钟命中一条定时则返回 true，并可选写出 schedule 元信息用于 report */
bool sr_schedule_tick(bool *out_from_sched, int64_t *out_sched_id, char *action_out, size_t action_sz);

#ifdef __cplusplus
}
#endif
