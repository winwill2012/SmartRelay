#include "sr_relay.h"
#include "sr_config.h"
#include "driver/gpio.h"

static bool s_on;

static int level_for_on(bool on) { return on ? RELAY_ON_LEVEL : (RELAY_ON_LEVEL ? 0 : 1); }

void sr_relay_init(void) {
  gpio_config_t io = {};
  io.pin_bit_mask = 1ULL << PIN_RELAY;
  io.mode = GPIO_MODE_OUTPUT;
  io.pull_up_en = GPIO_PULLUP_DISABLE;
  io.pull_down_en = GPIO_PULLDOWN_DISABLE;
  io.intr_type = GPIO_INTR_DISABLE;
  gpio_config(&io);
  s_on = false;
  gpio_set_level(PIN_RELAY, level_for_on(false));
}

void sr_relay_set(bool on) {
  s_on = on;
  gpio_set_level(PIN_RELAY, level_for_on(on));
}

bool sr_relay_get(void) { return s_on; }
