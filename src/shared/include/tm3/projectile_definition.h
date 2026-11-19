#ifndef TM3_PROJECTILE_DEFINITION_H
#define TM3_PROJECTILE_DEFINITION_H
#include "tm3/weapon_tuning.h"
typedef enum { TM3_SPIN_NONE, TM3_SPIN_YAW_PITCH, TM3_SPIN_YAW } Tm3ProjectileSpin;
typedef struct {
    uint16_t descriptor, effect_size;
    int16_t flight_sound;
    uint16_t flight_pitch;
    uint8_t spin, draw_ribbon;
} Tm3ProjectilePresentation;

struct Tm3Missile;
typedef enum {
    Tm3GuidedFlight,
    Tm3BallisticFlight,
    Tm3RainFlight,
    Tm3RicochetFlight
} Tm3MissileMotion;
typedef enum { Tm3ModelVisual, Tm3FrozenVisual, Tm3BurningVisual } Tm3MissileVisual;
typedef enum { Tm3HitNormal, Tm3HitFreeze, Tm3HitIgnite } Tm3MissileHitEffect;

/* Immutable module-owned policy. name is an exported symbol and the portable
   snapshot key; function/table addresses are resolved again in each runtime. */
typedef struct {
    const char* name;
    uint32_t original_profile;
    Tm3ProjectileTuning tuning;
    Tm3ProjectilePresentation artwork;
    Tm3MissileMotion motion;
    Tm3MissileVisual visual;
    Tm3MissileHitEffect hit_effect;
    uint8_t collide_world, apply_impulse, smoke_trail, trail_sections;
    void (*impact)(struct Tm3Missile* missile, int hit_car);
    void (*destroy)(struct Tm3Missile* missile);
    uint16_t (*damage_at_age)(uint32_t age);
} Tm3MissileDefinition;

/* Ordinary map weapons only. Car specials supply their own definitions. */
const Tm3MissileDefinition* Tm3WorldProjectile(int32_t profile);
extern const Tm3MissileDefinition Tm3ProjectileType_Fire;
extern const Tm3MissileDefinition Tm3ProjectileType_Homing;
extern const Tm3MissileDefinition Tm3ProjectileType_Power;
extern const Tm3MissileDefinition Tm3ProjectileType_Freeze;
extern const Tm3MissileDefinition Tm3ProjectileType_Napalm;
extern const Tm3MissileDefinition Tm3ProjectileType_Ricochet;
extern const Tm3MissileDefinition Tm3ProjectileType_Speed;
extern const Tm3MissileDefinition Tm3ProjectileType_Rain;
extern const Tm3MissileDefinition Tm3ProjectileType_Mortar;
#endif
