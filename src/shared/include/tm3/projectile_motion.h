#ifndef TM3_PROJECTILE_MOTION_H
#define TM3_PROJECTILE_MOTION_H
#include "tm3/weapon_tuning.h"
#include <stdint.h>

typedef struct {
    int16_t previous[3], position[3], velocity[3], midpoint[3];
    uint32_t age;
    uint16_t speed;
} Tm3ProjectileFlight;

typedef int32_t (*Tm3ProjectileRandom)(void* context);

void Tm3AxelWaveStep(const int16_t forward[3], const int32_t body_velocity_q12[3], int16_t step[3]);
uint16_t Tm3ProjectileLaunchVelocity(const Tm3ProjectileTuning* tuning, const int16_t forward[3],
    const int32_t body_velocity_q12[3], int rear, int16_t output[3]);
/* TM3 game normalization, including its GTE low-halfword input semantics. */
void Tm3ProjectileNormalize(const int32_t input[3], int16_t output[3]);
/* Movement precedes guidance. Collision/impact resolution belongs between the
   two operations; guide only after a successful movement, then advance age. */
void Tm3ProjectileAdvance(Tm3ProjectileFlight* flight);
void Tm3RicochetReflect(Tm3ProjectileFlight* flight, const int16_t normal[3], int32_t speed);
/* target is the validated target's world-space center, or NULL after removal.
   random returns the original nonnegative 15-bit draw and is consumed only
   during initial deviation. Its seed belongs to simulation snapshot state. */
void Tm3ProjectileGuide(Tm3ProjectileFlight* flight, const Tm3ProjectileTuning* tuning,
    const int16_t target[3], Tm3ProjectileRandom random, void* context);
/* 8002e67c: force is applied along the projectile's unit forward direction,
   with a separate upward impulse (negative Y), in Q12 force units. */
void Tm3ProjectileImpactForce(
    const Tm3ProjectileTuning* tuning, const int16_t direction[3], int32_t output[3]);
#endif
