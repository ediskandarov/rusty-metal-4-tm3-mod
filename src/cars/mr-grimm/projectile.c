#include "projectile.h"

const Tm3MissileDefinition Tm3ProjectileType_Grimm = {
    .name = "Tm3ProjectileType_Grimm",
    .original_profile = Tm3ProjectileGrimm,
    .tuning = { 1000, 0, 5000, 8192, 200, 0, 0, 3700, 0, { 0, 0, 0 }, 0, 256, 0 },
    .artwork = { 8, 0, 15, 1400, TM3_SPIN_NONE, 0 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};
