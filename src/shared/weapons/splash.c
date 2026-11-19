#include "flame.h"
#include "module_import.h"
#include "tm3/missile.h"
#include "tm3/resources.h"

static void splash(Tm3Missile* missile, int mortar)
{
    SVECTOR position = { missile->flight.position[0], missile->flight.position[1],
        missile->flight.position[2], 0 };
    /* 8003132c (Mortar) and 80030df4 (Napalm) choose distinct splash profiles. */
    Tm3ExplosionSettings splash = { .position = position,
        .material = Tm3Untextured,
        .color = 0x202020,
        .height = 32,
        .inner_ratio_q12 = 1024,
        .speed = mortar ? 128 : 384,
        .duration = mortar ? 30 : 15,
        .radial_force = mortar ? 764 : 1024,
        .lift = mortar ? 640 : 700,
        .owner = ObjectGetHeader(missile)->owner,
        .source = ObjectGetHeader(missile)->participant,
        .affects_owner = 1,
        .once_per_car = 1 };
    if (mortar) {
        position.vy -= 200;
        Tm3SpawnSprite(0, &position, 800, NULL, 12, -1);
    } else {
        splash.position.vy -= 96;
        const SVECTOR still = { 0 };
        Tm3GroundImpact(
            &position, ObjectGetHeader(missile)->participant, 160, 3, 768, missile->surface_kind);
        Tm3SpawnSurfaceSprite(1, &position, 768, &still, 12, -1, missile->surface_kind);
    }
    Tm3SpawnExplosion(&splash);
}
void Tm3MortarImpact(Tm3Missile* missile, int hit_car)
{
    splash(missile, 1);
}
void Tm3NapalmImpact(Tm3Missile* missile, int hit_car)
{
    if (!hit_car)
        splash(missile, 0);
    else {
        SVECTOR position = { missile->flight.position[0], missile->flight.position[1],
            missile->flight.position[2], 0 };
        Tm3SpawnSprite(0, &position, missile->definition->tuning.impact_size, NULL, 12, -1);
    }
}
