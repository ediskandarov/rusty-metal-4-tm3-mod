#include "projectile.h"

const Tm3MissileDefinition Tm3ProjectileType_Spectre = {
    .name = "Tm3ProjectileType_Spectre",
    .original_profile = Tm3ProjectileSpectre,
    .tuning = { 400, 2400, 5000, 8192, 100, 1, 180, 1000, 0, { 0, 0, 0 }, 1, 256, 0 },
    .artwork = { 0, 10, 15, 1200, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 0,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};
