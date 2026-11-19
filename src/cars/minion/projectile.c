#include "projectile.h"

const Tm3MissileDefinition Tm3ProjectileType_MinionCentral = {
    .name = "Tm3ProjectileType_MinionCentral",
    .original_profile = Tm3ProjectileMinionCentral,
    .tuning = { 600, 1024, 4096, 8192, 196, 0, 120, 1400, 0, { 0, 0, 0 }, 1, 256, 0 },
    .artwork = { 0, 10, 15, 1080, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};

const Tm3MissileDefinition Tm3ProjectileType_MinionSide = {
    .name = "Tm3ProjectileType_MinionSide",
    .original_profile = Tm3ProjectileMinionSide,
    .tuning = { 300, 2000, 5000, 10000, 100, 1, 160, 1200, 0, { 0, 0, 0 }, 1, 512, 100 },
    .artwork = { 0, 10, 15, 1280, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};
