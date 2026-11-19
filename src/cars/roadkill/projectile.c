#include "projectile.h"

const Tm3MissileDefinition Tm3ProjectileType_Roadkill = {
    .name = "Tm3ProjectileType_Roadkill",
    .original_profile = Tm3ProjectileRoadkill,
    .tuning = { 700, 100, 5000, 8192, 1000, 0, 0, 2048, 0, { 0, -1760, 0 }, 1, 256, 0 },
    .artwork = { 24, 10, 0, 1880, TM3_SPIN_YAW_PITCH, 0 },
    .motion = Tm3BallisticFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 0,
    .smoke_trail = 1,
    .trail_sections = 8,
    .impact = Tm3RoadkillImpact,
};
