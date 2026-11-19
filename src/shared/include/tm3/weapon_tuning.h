#ifndef TM3_WEAPON_TUNING_H
#define TM3_WEAPON_TUNING_H
#include "tm3/body.h"
#include <stdint.h>

/* Defaults before cheats and per-launch overrides. Speeds are world units/sec;
   lifetime and regeneration periods are Q12 seconds, not tick counts. */
typedef struct {
    int16_t damage;
    uint16_t steering;
    uint32_t speed, lifetime_q12;
    int32_t recoil;
    uint16_t omnidirectional_homing, initial_deviation;
    uint16_t impact_force, interaction_radius;
    int16_t launch_offset[3];
    uint8_t effect;
    uint16_t impact_size;
    int32_t impact_lift;
} Tm3ProjectileTuning;

typedef struct {
    uint32_t regeneration_q12, initial_ammo, maximum_ammo;
} Tm3SpecialTuning;

/* Null means an invalid ID. All 24 original profiles and all 16 cars exist. */
const Tm3ProjectileTuning* Tm3ProjectileDefaults(int32_t profile);
const Tm3SpecialTuning* Tm3SpecialDefaults(Tm3CarId car);
uint32_t Tm3WeaponTimeTicks(uint32_t seconds_q12);
/* Profile 14's update computes damage after movement increments age. */
uint16_t Tm3WarthogDamage(uint32_t age);
#endif
