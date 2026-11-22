#include "module_import.h"
#include "tm3/prop.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/modules/car_weapon.h"
#include <stdlib.h>

static void process(Tm3Prop* prop)
{
    const Tm3PropResource* r = prop->resource;
    int32_t direction[3] = { r->origin.vx - prop->transform.t[0],
        r->origin.vy - prop->transform.t[1], r->origin.vz - prop->transform.t[2] };
    s32 floor = r->origin.vy - 4096;
    if (floor < -30720)
        floor = -30720;
    int return_home = prop->transform.t[1] <= floor || prop->transform.t[1] > r->origin.vy
        || ((int64_t)direction[0] * direction[0] + (int64_t)direction[1] * direction[1]
               + (int64_t)direction[2] * direction[2])
            >= 4LL * r->range * r->range;
    if (return_home || prop->age % 120 == 0) {
        int16_t unit[3];
        if (!return_home || !(direction[0] || direction[1] || direction[2])) {
            direction[0] = 1023 - (rand() & 2047);
            direction[1] = 255 - (rand() & 511);
            direction[2] = 1023 - (rand() & 2047);
        }
        WEB_MODULE("mtm3fx.sym", Tm3ProjectileNormalize)(direction, unit);
        s32 speed = r->speed + r->speed / 2 - rand() % r->speed;
        prop->velocity.vx = (unit[0] * speed + 2048) >> 12;
        prop->velocity.vy = (unit[1] * speed + 2048) >> 12;
        prop->velocity.vz = (unit[2] * speed + 2048) >> 12;
    }
    prop->transform.t[0] += prop->velocity.vx;
    prop->transform.t[1] += prop->velocity.vy;
    prop->transform.t[2] += prop->velocity.vz;
    ObjectSetPosition(prop, prop->transform.t[0], prop->transform.t[1], prop->transform.t[2]);
    WEB_MODULE("mtm3fx.sym", Tm3PropSpin)(prop);
}

static void destroyed(Tm3Prop* prop, void* projectile)
{
    Car* owner = ObjectGetHeader(projectile)->owner;
    if (owner && GameIsCarRegistered(owner) && owner->control_kind == CAR_CONTROL_PLAYER) {
        WEB_MODULE("car", CarWeaponForRole)(owner, CarWeaponSpecial)->amount = 8;
        WEB_MODULE("car", CarApplyParticipantDamage)
        (owner, NULL, (WebParticipantId) { 0 }, -owner->maximum_health, NULL, NULL);
        WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3_s32", NULL, NULL, 1308, 0);
    }
}

const Tm3PropBehavior Tm3HangarSaucer = {
    "Tm3HangarSaucer",
    process,
    destroyed,
};
