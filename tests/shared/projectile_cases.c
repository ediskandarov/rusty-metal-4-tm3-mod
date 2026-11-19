#include "projectile_cases.h"
#include <stddef.h>
#include <stdlib.h>
extern const Tm3MissileDefinition Tm3ProjectileType_Fire;
extern const Tm3MissileDefinition Tm3ProjectileType_Homing;
extern const Tm3MissileDefinition Tm3ProjectileType_Power;
extern const Tm3MissileDefinition Tm3ProjectileType_Freeze;
extern const Tm3MissileDefinition Tm3ProjectileType_Napalm;
extern const Tm3MissileDefinition Tm3ProjectileType_Ricochet;
extern const Tm3MissileDefinition Tm3ProjectileType_Speed;
extern const Tm3MissileDefinition Tm3ProjectileType_Rain;
extern const Tm3MissileDefinition Tm3ProjectileType_Mortar;
extern const Tm3MissileDefinition Tm3ProjectileType_Warthog;
extern const Tm3MissileDefinition Tm3ProjectileType_Spectre;
extern const Tm3MissileDefinition Tm3ProjectileType_Roadkill;
extern const Tm3MissileDefinition Tm3ProjectileType_Grimm;
extern const Tm3MissileDefinition Tm3ProjectileType_MinionCentral;
extern const Tm3MissileDefinition Tm3ProjectileType_MinionSide;
extern const Tm3MissileDefinition Tm3ProjectileType_Flower;
extern const Tm3MissileDefinition Tm3ProjectileType_PrimevalTumbling;
extern const Tm3MissileDefinition Tm3ProjectileType_PrimevalSkull;

const Tm3MissileDefinition* test_projectile(int profile)
{
    const Tm3MissileDefinition* definitions[] = {
        &Tm3ProjectileType_Fire,
        &Tm3ProjectileType_Homing,
        &Tm3ProjectileType_Power,
        &Tm3ProjectileType_Freeze,
        &Tm3ProjectileType_Napalm,
        &Tm3ProjectileType_Ricochet,
        &Tm3ProjectileType_Speed,
        &Tm3ProjectileType_Rain,
        &Tm3ProjectileType_Mortar,
        &Tm3ProjectileType_Warthog,
        &Tm3ProjectileType_Spectre,
        &Tm3ProjectileType_Roadkill,
        &Tm3ProjectileType_Grimm,
        &Tm3ProjectileType_MinionCentral,
        &Tm3ProjectileType_MinionSide,
        &Tm3ProjectileType_Flower,
        &Tm3ProjectileType_PrimevalTumbling,
        &Tm3ProjectileType_PrimevalSkull,
    };
    for (unsigned i = 0; i < sizeof(definitions) / sizeof(*definitions); ++i)
        if ((int)definitions[i]->original_profile == profile)
            return definitions[i];
    return NULL;
}
const Tm3ProjectileTuning* test_tuning(int profile)
{
    const Tm3MissileDefinition* definition = test_projectile(profile);
    return definition ? &definition->tuning : NULL;
}
const Tm3ProjectilePresentation* test_artwork(int profile)
{
    const Tm3MissileDefinition* definition = test_projectile(profile);
    return definition ? &definition->artwork : NULL;
}
/* These tests cover data and integer math only. Real impact/destruction and
   cross-module callback execution are covered by the browser replay checks. */
void Tm3NapalmImpact(struct Tm3Missile* missile, int hit)
{
    (void)missile;
    (void)hit;
    abort();
}
void Tm3MortarImpact(struct Tm3Missile* missile, int hit)
{
    (void)missile;
    (void)hit;
    abort();
}
void Tm3RoadkillImpact(struct Tm3Missile* missile, int hit)
{
    (void)missile;
    (void)hit;
    abort();
}
void Tm3RainSplit(struct Tm3Missile* missile)
{
    (void)missile;
    abort();
}
