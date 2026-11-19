#include "radar.h"
#include "module_import.h"
#include "tm3/prop.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/modules/car_weapon.h"
#include <stdlib.h>
#include <string.h>

static void process(Tm3Prop* prop)
{
    const Tm3PropResource* r = prop->resource;
    /* 800357d8: the first car carrying Radar designates the nearest other car. */
    Car* holder = NULL;
    for (int i = 0; i < GameInfo.car_count; ++i) {
        Car* car = GameInfo.cars[i];
        if (car->weapons && car->weapons[12].amount) {
            holder = car;
            break;
        }
    }
    Car* closest = NULL;
    s32 best = INT32_MAX;
    for (int i = 0; holder && i < GameInfo.car_count; ++i) {
        Car* car = GameInfo.cars[i];
        const Tm4ShortVectorXYZ* p = &ObjectGetHeader(car)->position;
        s32 dist
            = DistanceApprox3d(p->vx - r->origin.vx, p->vy - r->origin.vy, p->vz - r->origin.vz);
        if (car != holder && dist < best) {
            closest = car;
            best = dist;
        }
    }
    if (closest) {
        const Tm4ShortVectorXYZ* p = &ObjectGetHeader(closest)->position;
        const int16_t target[3]
            = { p->vx - r->origin.vx, p->vy - r->origin.vy, p->vz - r->origin.vz };
        WEB_MODULE("mtm3fx.sym", Tm3ProjectileOrient)(&prop->transform, target);
    }
}

const Tm3PropBehavior Tm3TokyoRadar = {
    "Tm3TokyoRadar",
    process,
    NULL,
};

const MATRIX* Tm3TokyoRadarPose(Car* car)
{
    Tm4ObjectHeader* first = ObjectGetHeader(car);
    while (first->previous)
        first = first->previous;
    for (Tm4ObjectHeader* obj = first; obj; obj = obj->next) {
        if (strcmp(obj->name, "tm3Prop"))
            continue;
        Tm3Prop* prop = ObjectGetPayload(obj);
        if (prop->behavior == &Tm3TokyoRadar)
            return &prop->transform;
    }
    return NULL;
}
