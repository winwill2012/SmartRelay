#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*sr_ota_progress_cb_t)(int percent, const char *phase);

void sr_ota_https(const char *url, const char *md5expect32, size_t size_hint, sr_ota_progress_cb_t on_prog);

#ifdef __cplusplus
}
#endif
