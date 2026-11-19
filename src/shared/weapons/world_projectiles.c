#include "tm3/projectile_definition.h"
#include <stddef.h>
void Tm3NapalmImpact(struct Tm3Missile*, int);
void Tm3MortarImpact(struct Tm3Missile*, int);
void Tm3RainSplit(struct Tm3Missile*);

/* Original weapon initialization at 8002c450; only ordinary weapons live here. */
const Tm3MissileDefinition Tm3ProjectileType_Fire = {
    .name = "Tm3ProjectileType_Fire",
    .original_profile = Tm3ProjectileFire,
    .tuning = { 300, 800, 6000, 8192, 400, 0, 0, 1200, 0, { 0, 0, 0 }, 1, 256, 0 },
    .artwork = { 0, 10, 15, 1880, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};

const Tm3MissileDefinition Tm3ProjectileType_Homing = {
    .name = "Tm3ProjectileType_Homing",
    .original_profile = Tm3ProjectileHoming,
    .tuning = { 400, 2000, 6000, 8192, 200, 0, 0, 1090, 0, { 0, 0, 0 }, 1, 256, 0 },
    .artwork = { 0, 10, 15, 1560, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};

const Tm3MissileDefinition Tm3ProjectileType_Power = {
    .name = "Tm3ProjectileType_Power",
    .original_profile = Tm3ProjectilePower,
    .tuning = { 800, 0, 6000, 8192, 600, 0, 0, 1780, 0, { 0, 0, 0 }, 1, 384, 0 },
    .artwork = { 0, 10, 15, 1180, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};

const Tm3MissileDefinition Tm3ProjectileType_Freeze = {
    .name = "Tm3ProjectileType_Freeze",
    .original_profile = Tm3ProjectileFreeze,
    .tuning = { 200, 1000, 4600, 8192, 200, 0, 0, 400, 0, { 0, 0, 0 }, 1, 256, 0 },
    .artwork = { 0, 10, 7, 1180, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3FrozenVisual,
    .hit_effect = Tm3HitFreeze,
    .collide_world = 1,
    .apply_impulse = 0,
    .smoke_trail = 0,
    .trail_sections = 8,
};

const Tm3MissileDefinition Tm3ProjectileType_Napalm = {
    .name = "Tm3ProjectileType_Napalm",
    .original_profile = Tm3ProjectileNapalm,
    .tuning = { 600, 100, 5466, 16384, 300, 0, 0, 512, 0, { 0, -2048, 0 }, 1, 256, 0 },
    .artwork = { 0, 10, 13, 2000, TM3_SPIN_NONE, 1 },
    .motion = Tm3BallisticFlight,
    .visual = Tm3BurningVisual,
    .hit_effect = Tm3HitIgnite,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 1,
    .trail_sections = 8,
    .impact = Tm3NapalmImpact,
};

const Tm3MissileDefinition Tm3ProjectileType_Ricochet = {
    .name = "Tm3ProjectileType_Ricochet",
    .original_profile = Tm3ProjectileRicochet,
    .tuning = { 400, 0, 5000, 0, 500, 0, 0, 0, 80, { 0, 0, 0 }, 0, 256, 1800 },
    .artwork = { 64, 0, 15, 1180, TM3_SPIN_NONE, 0 },
    .motion = Tm3RicochetFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};

const Tm3MissileDefinition Tm3ProjectileType_Speed = {
    .name = "Tm3ProjectileType_Speed",
    .original_profile = Tm3ProjectileSpeed,
    .tuning = { 80, 140, 10000, 8192, 164, 0, 0, 400, 0, { 0, 0, 0 }, 1, 256, 0 },
    .artwork = { 0, 8, 14, 1280, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 4,
};

const Tm3MissileDefinition Tm3ProjectileType_Rain = {
    .name = "Tm3ProjectileType_Rain",
    .original_profile = Tm3ProjectileRain,
    .tuning = { 200, 0, 6000, 8192, 200, 0, 0, 1024, 0, { 0, -1600, 0 }, 2, 512, 0 },
    .artwork = { 0, 8, 15, 880, TM3_SPIN_NONE, 0 },
    .motion = Tm3RainFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
    .destroy = Tm3RainSplit,
};

const Tm3MissileDefinition Tm3ProjectileType_Mortar = {
    .name = "Tm3ProjectileType_Mortar",
    .original_profile = Tm3ProjectileMortar,
    .tuning = { 500, 800, 4363, 8192, 639, 0, 0, 1240, 0, { 0, -3320, 0 }, 1, 256, 0 },
    .artwork = { 32, 18, 22, 1180, TM3_SPIN_NONE, 1 },
    .motion = Tm3BallisticFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 0,
    .smoke_trail = 1,
    .trail_sections = 8,
    .impact = Tm3MortarImpact,
};

const Tm3MissileDefinition* Tm3WorldProjectile(int32_t profile)
{
    static const Tm3MissileDefinition* const weapons[] = {
        &Tm3ProjectileType_Fire,
        &Tm3ProjectileType_Homing,
        &Tm3ProjectileType_Power,
        &Tm3ProjectileType_Freeze,
        &Tm3ProjectileType_Napalm,
        &Tm3ProjectileType_Ricochet,
        &Tm3ProjectileType_Speed,
        &Tm3ProjectileType_Rain,
        &Tm3ProjectileType_Mortar,
    };
    return profile >= 0 && profile < 9 ? weapons[profile] : NULL;
}
