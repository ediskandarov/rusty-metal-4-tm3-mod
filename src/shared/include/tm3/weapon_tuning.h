#ifndef TM3_WEAPON_TUNING_H
#define TM3_WEAPON_TUNING_H
#include "tm3/body.h"
#include <stdint.h>

/* Original IDs are retained for diagnostics, never used to dispatch car behavior. */
typedef enum {
    Tm3ProjectileFire = 0,
    Tm3ProjectileHoming = 1,
    Tm3ProjectilePower = 2,
    Tm3ProjectileFreeze = 3,
    Tm3ProjectileNapalm = 4,
    Tm3ProjectileRicochet = 5,
    Tm3ProjectileSpeed = 6,
    Tm3ProjectileRain = 7,
    Tm3ProjectileMortar = 8,
    Tm3ProjectileWarthog = 14,
    Tm3ProjectileSpectre = 15,
    Tm3ProjectileRoadkill = 17,
    Tm3ProjectileGrimm = 18,
    Tm3ProjectileMinionCentral = 19,
    Tm3ProjectileMinionSide = 20,
    Tm3ProjectileFlower = 21,
    Tm3ProjectilePrimevalTumbling = 22,
    Tm3ProjectilePrimevalSkull = 23,
    Tm3ProjectileProfileCount = 24,
} Tm3ProjectileProfile;

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

uint32_t Tm3WeaponTimeTicks(uint32_t seconds_q12);
#endif
