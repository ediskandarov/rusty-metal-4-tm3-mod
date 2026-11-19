#include "module_import.h"
#include "projectile.h"
#include "tm3/missile.h"
#include "tm3/resources.h"

void Tm3RoadkillImpact(Tm3Missile* missile, int hit_car)
{
    SVECTOR position = { missile->flight.position[0], missile->flight.position[1],
        missile->flight.position[2], 0 };
    /* 80032104 uses two sprites at the contact and a lower class-9 origin. */
    WEB_MODULE("mtm3fx.sym", Tm3SpawnSprite)(0, &position, 1024, NULL, 12, -1);
    WEB_MODULE("mtm3fx.sym", Tm3SpawnSprite)(1, &position, 1024, NULL, 12, -1);
    position.vy -= 32;
    Tm3ExplosionSettings burst = { .position = position,
        .color = 0x30,
        .height = 80,
        .inner_ratio_q12 = 1024,
        .speed = 384,
        .duration = 10,
        .radial_force = 760,
        .lift = 700,
        .owner = ObjectGetHeader(missile)->owner,
        .source = ObjectGetHeader(missile)->participant,
        .affects_owner = 1,
        .once_per_car = 1 };
    WEB_MODULE("mtm3fx.sym", Tm3SpawnExplosion)(&burst);
}
