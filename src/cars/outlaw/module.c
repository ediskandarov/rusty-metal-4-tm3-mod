#include "mod_api.h"
#include "special.h"
#include "tm3/resources.h"
#include "tm4/main/game.h"
#include "tm4/main/geometry.h"
#include "tm4/main/math3d.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_scratch.h"
#include "tm4/modules/car_weapon.h"
#include <LIBETC.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include "tm3/lightning.h"
static const Tm3EngineSettings* engine_settings;
u32 CarMtm3olSizeof = sizeof(Tm3BodyAnimation);
CarNameEntry CarMtm3olDisplayGroupTranslations[] = {
    { "tm3_part04", 4 },
    { "tm3_part05", 5 },
    { NULL, -1 },
};
s32 CarMtm3olConstructor(Car* car, void* context)
{
    memset(context, 0, sizeof(Tm3BodyAnimation));
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)
    (car, engine_settings);
    return 1;
}
s32 CarMtm3olProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3BodyAnimate)(Tm3Outlaw, context, 0);
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)
    (car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)
    (car, engine_settings);
    return 1;
}
void CarMtm3olClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample))
        abort();
}
void CarMtm3olClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)
    ();
}
s32 CarMtm3olWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    return Tm3CarLightning(car);
}

MATRIX* CarMtm3olDisplaySpecialGroupDisplay(
    Car* car, s32 association, CarRenderGroup* group, MATRIX* lighting, void* context)
{
    Tm3BodyPose pose = WEB_MODULE("mtm3fx.sym", Tm3BodyGroupPose)(Tm3Outlaw, association, context);
    if (pose.transform == Tm3BodyHidden)
        return NULL;
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    MATRIX local;
    RotationMatrixY(0, &local);
    local.t[0] = group->center.vector.vx;
    local.t[1] = group->center.vector.vy;
    local.t[2] = group->center.vector.vz;
    SetLightMatrix(lighting);
    CompMatrix(&scratch->car_to_camera, &local, &scratch->group);
    return &scratch->group;
}
static const SnapshotField car_fields[] = {
    SNAP_POD(Tm3BodyAnimation, angle),
    SNAP_POD(Tm3BodyAnimation, frame),
    SNAP_POD(Tm3BodyAnimation, frame_ticks),
    { 0 },
};
static const SnapshotType car_snapshot = {
    .name = "tm3OutlawCar", .size = sizeof(Tm3BodyAnimation), .fields = car_fields, .hash_fields = 1
};
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3olProcess
            && car->render_callback == CarMtm3olDisplaySpecialGroupDisplay
            && !car->collision_callback && !car->destructor_callback
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_OUTLAW_TEST
static int test_read(Car* car, int field)
{
    if (!field)
        return WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial)->amount;
    if (field == 1)
        return ((Tm3BodyAnimation*)car->callback_context)->frame;
    if (field == 2 || field == 7) {
        for (s32 i = 0; i < GameInfo.car_count; ++i)
            if (GameInfo.cars[i] != car)
                return field == 2 ? GameInfo.cars[i]->health : GameInfo.cars[i]->transform.t[1];
        return -1;
    }
    Tm4ObjectHeader* h = ObjectGetHeader(car);
    while (h->previous)
        h = h->previous;
    for (; h; h = h->next) {
        if (h->owner != car || strcmp(h->name, "tm3OutlawEmitter"))
            continue;
        OutlawEmitter* emitter = ObjectGetPayload(h);
        if (field == 3)
            return emitter->age;
        int locked = 0, bolts = 0, points = 0;
        for (int n = 0; n < 16; ++n)
            if (emitter->bolts[n]) {
                ++bolts;
                locked += emitter->bolts[n]->target_serial >= 0;
                points += emitter->bolts[n]->count;
            }
        return field == 4 ? bolts : field == 5 ? locked : points;
    }
    return -1;
}
static void test_place(Car* owner, int slot, int distance, int lateral)
{
    Car* target = GameInfo.players[slot].car;
    MATRIX placement = owner->transform;
    for (int i = 0; i < 3; ++i)
        placement.t[i] += (placement.m[i][2] * distance + placement.m[i][0] * lateral) >> 12;
    WEB_MODULE("car", CarOrientWithMatrix)(target, &placement);
    target->shield_ticks = 0;
}
static void test_select(Car* car)
{
    car->controls.selected_weapon = 0;
    car->controls.selected_weapon_slot = 0;
}
#endif
#define EXPORT(symbol)                                                                             \
    if (!strcasecmp(name, #symbol))                                                                \
    return (OSWord) & symbol
__attribute__((visibility("default"))) OSWord Tm4ModuleExport(const char* name)
{
    if (!strcmp(name, "__rm4_car_snapshot_type"))
        return (OSWord)car_snapshot_type;
#ifdef TM3_OUTLAW_TEST
    EXPORT(test_select);
    EXPORT(test_place);
    EXPORT(test_read);
#endif
    EXPORT(CarMtm3olSizeof);
    EXPORT(CarMtm3olDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3olDisplayGroupTranslations);
    EXPORT(CarMtm3olConstructor);
    EXPORT(CarMtm3olProcess);
    EXPORT(CarMtm3olClassConstructor);
    EXPORT(CarMtm3olClassDestructor);
    EXPORT(CarMtm3olWeaponSpecialConstructor);
    return 0;
}
