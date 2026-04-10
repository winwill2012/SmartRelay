#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  SR_LED_PROVISION = 0,
  SR_LED_BREATH = 1,
} sr_led_mode_t;

void sr_led_init(void);
void sr_led_set_mode(sr_led_mode_t m);
void sr_led_tick(void);

#ifdef __cplusplus
}
#endif
