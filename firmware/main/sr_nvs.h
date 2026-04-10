#pragma once

#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

bool sr_nvs_get_str(const char *key, char *out, size_t out_sz);
void sr_nvs_set_str(const char *key, const char *val);
void sr_nvs_erase_key(const char *key);
void sr_nvs_clear_wifi(void);
bool sr_nvs_get_i64(const char *key, int64_t *out);
void sr_nvs_set_i64(const char *key, int64_t val);

#ifdef __cplusplus
}
#endif
