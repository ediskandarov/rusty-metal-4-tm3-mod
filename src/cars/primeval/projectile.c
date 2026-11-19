#include "projectile.h"

const Tm3MissileDefinition Tm3ProjectileType_PrimevalTumbling = {
    .name = "Tm3ProjectileType_PrimevalTumbling",
    .original_profile = Tm3ProjectilePrimevalTumbling,
    .tuning = { 600, 2000, 5000, 8192, 100, 0, 160, 1024, 0, { 0, 0, 0 }, 1, 512, 100 },
    .artwork = { 24, 12, 15, 1080, TM3_SPIN_YAW_PITCH, 0 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};

const Tm3MissileDefinition Tm3ProjectileType_PrimevalSkull = {
    .name = "Tm3ProjectileType_PrimevalSkull",
    .original_profile = Tm3ProjectilePrimevalSkull,
    .tuning = { 340, 2000, 6000, 8192, 100, 1, 180, 3222, 0, { 0, -512, 0 }, 2, 512, 100 },
    .artwork = { 8, 128, 0, 1280, TM3_SPIN_NONE, 0 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};
