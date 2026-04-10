#include "sr_led.h"
#include "sr_config.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_timer.h"
#include <cmath>

static sr_led_mode_t s_mode = SR_LED_PROVISION;
static const ledc_channel_t k_ch = LEDC_CHANNEL_0;
static const ledc_timer_t k_timer = LEDC_TIMER_0;

void sr_led_init(void) {
  ledc_timer_config_t t = {};
  t.speed_mode = LEDC_LOW_SPEED_MODE;
  t.duty_resolution = LEDC_TIMER_10_BIT;
  t.timer_num = k_timer;
  t.freq_hz = 5000;
  t.clk_cfg = LEDC_AUTO_CLK;
  ledc_timer_config(&t);

  ledc_channel_config_t ch = {};
  ch.gpio_num = PIN_LED;
  ch.speed_mode = LEDC_LOW_SPEED_MODE;
  ch.channel = k_ch;
  ch.intr_type = LEDC_INTR_DISABLE;
  ch.timer_sel = k_timer;
  ch.duty = 0;
  ch.hpoint = 0;
  ledc_channel_config(&ch);
}

void sr_led_set_mode(sr_led_mode_t m) { s_mode = m; }

void sr_led_tick(void) {
  if (s_mode == SR_LED_PROVISION) {
    static int64_t t0_us = 0;
    int64_t now = esp_timer_get_time();
    if (t0_us == 0) t0_us = now;
    if (now - t0_us > 200000) {
      t0_us = now;
      static bool on = false;
      on = !on;
      ledc_set_duty(LEDC_LOW_SPEED_MODE, k_ch, on ? 1023 : 0);
      ledc_update_duty(LEDC_LOW_SPEED_MODE, k_ch);
    }
  } else {
    int64_t ms = esp_timer_get_time() / 1000;
    float ph = (float)ms / 2500.0f * 2.0f * 3.1415926f;
    int duty = (int)((sinf(ph) * 0.5f + 0.5f) * 900) + 50;
    ledc_set_duty(LEDC_LOW_SPEED_MODE, k_ch, duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, k_ch);
  }
}
