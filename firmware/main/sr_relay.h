#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

void sr_relay_init(void);
void sr_relay_set(bool on);
bool sr_relay_get(void);

#ifdef __cplusplus
}
#endif
