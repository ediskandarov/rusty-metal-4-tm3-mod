#include "projectile.h"

const Tm3MissileDefinition Tm3ProjectileType_Warthog = {
    .name = "Tm3ProjectileType_Warthog",
    .original_profile = Tm3ProjectileWarthog,
    .tuning = { 130, 1600, 5000, 8192, 100, 0, 90, 1300, 0, { 0, 0, 0 }, 1, 256, 0 },
    .artwork = { 0, 10, 15, 1200, TM3_SPIN_NONE, 1 },
    .motion = Tm3GuidedFlight,
    .visual = Tm3ModelVisual,
    .hit_effect = Tm3HitNormal,
    .collide_world = 1,
    .apply_impulse = 1,
    .smoke_trail = 0,
    .trail_sections = 8,
    .damage_at_age = Tm3WarthogDamage,
};
