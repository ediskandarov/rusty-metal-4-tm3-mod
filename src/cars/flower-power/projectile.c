#include "projectile.h"

const Tm3MissileDefinition Tm3ProjectileType_Flower = {
    .name = "Tm3ProjectileType_Flower",
    .original_profile = Tm3ProjectileFlower,
    .tuning = { 340, 2000, 4000, 8192, 100, 1, 160, 2048, 0, { 0, -512, 0 }, 0, 512, 100 },
    .artwork = { 48, 0, -1, 1280, TM3_SPIN_YAW, 0 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
};
