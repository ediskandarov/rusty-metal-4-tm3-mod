#include "module_import.h"
#include "tm3/missile.h"
#include "tm3/resources.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_scratch.h"
#include "tm4/modules/car_weapon.h"
#include <LIBETC.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static const Tm3EngineSettings* engine_settings;
static const CarMount* nozzle;
void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);
u32 CarMtm3dsSizeof = sizeof(Tm3MissileOwner);
CarNameEntry CarMtm3dsDisplayGroupTranslations[] = {
    { "tm3_part04", 4 },
    { "tm3_part05", 5 },
    { NULL, -1 },
};
s32 CarMtm3dsConstructor(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3dsProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)(car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3dsClassConstructor(RegistryDirectory* directory)
{
    nozzle = RegGetFileDataPS(directory, "TM3Darkside");
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!nozzle || !engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(10) || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(0)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(7)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(15))
        abort();
}
void CarMtm3dsClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
s32 CarMtm3dsWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, mode, &transform, &inherited);
    int freeze = WEB_MODULE("mtm3fx.sym", Tm3MissileLaunch)(context, car, target, &transform, mode,
                     WEB_MODULE("mtm3fx.sym", Tm3WorldProjectile)(Tm3ProjectileFreeze), 0, 0xd00000)
        != NULL;
    int flames = WEB_MODULE("mtm3fx.sym", Tm3StartFlamer)(car, &nozzle->position);
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)
    ("tm3darkside", NULL, car, 1300, 0);
    return flames || freeze;
}
MATRIX* CarMtm3dsDisplaySpecialGroupDisplay(
    Car* car, s32 association, CarRenderGroup* group, MATRIX* lighting, void* context)
{
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    const CarWheel* wheel = &car->wheels[association == 4 ? 3 : 2];
    MATRIX light;
    RotationMatrixX(wheel->rotation, &scratch->group);
    scratch->group.t[0] = group->center.vector.vx;
    scratch->group.t[1] = group->center.vector.vy + wheel->direction.fields.displacement;
    scratch->group.t[2] = group->center.vector.vz;
    MulMatrix0(lighting, &scratch->group, &light);
    SetLightMatrix(&light);
    CompMatrix(&scratch->car_to_camera, &scratch->group, &scratch->group);
    return &scratch->group;
}
static const SnapshotField car_fields[] = {
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[0], "tm3Missile"),
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[1], "tm3Missile"),
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[2], "tm3Missile"),
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[3], "tm3Missile"),
    { 0 },
};
static const SnapshotType car_snapshot = { .name = "tm3DarksideCar",
    .size = sizeof(Tm3MissileOwner),
    .fields = car_fields,
    .hash_fields = 1 };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3dsProcess && !car->destructor_callback
            && !car->collision_callback
            && car->render_callback == CarMtm3dsDisplaySpecialGroupDisplay
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_DARKSIDE_TEST
static int test_rear_groups(Car* car)
{
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    MATRIX saved_camera = scratch->car_to_camera, saved_group = scratch->group;
    MATRIX identity = { 0 };
    RotationMatrixX(0, &identity);
    scratch->car_to_camera = identity;
    int mask = 0;
    for (int selector = 4; selector <= 5; ++selector) {
        CarRenderGroup* group = WEB_MODULE("car", CarDisplayGetGroup)(car, 0, selector);
        if (!group)
            continue;
        CarWheel* wheel = &car->wheels[selector == 4 ? 3 : 2];
        s16 saved_rotation = wheel->rotation;
        s8 saved_height = wheel->direction.fields.displacement;
        wheel->rotation = selector == 4 ? 1024 : -1024;
        wheel->direction.fields.displacement = selector == 4 ? -17 : 23;
        MATRIX expected;
        RotationMatrixX(wheel->rotation, &expected);
        MATRIX* actual
            = car->render_callback(car, selector, group, &identity, car->callback_context);
        if (actual && memcmp(actual->m, expected.m, sizeof(expected.m)) == 0
            && actual->t[0] == group->center.vector.vx
            && actual->t[1] == group->center.vector.vy + wheel->direction.fields.displacement
            && actual->t[2] == group->center.vector.vz)
            mask |= 1 << (selector - 4);
        wheel->rotation = saved_rotation;
        wheel->direction.fields.displacement = saved_height;
    }
    scratch->car_to_camera = saved_camera;
    scratch->group = saved_group;
    return mask;
}
static Car* test_car(s32 slot)
{
    return slot >= 0 && slot < 8 ? GameInfo.players[slot].car : NULL;
}
static s32 test_read(Car* car, s32 field)
{
    if (field == 0)
        return WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial)->amount;
    if (field == 5)
        return GameInfo.players[1].car ? GameInfo.players[1].car->freeze_ticks : 0;
    const char* classes[] = { "tm3Flamer", "tm3Flame", "tm3Burn", "tm3Missile" };
    if (field < 1 || field > 4)
        return -1;
    Tm4ObjectHeader* h = ObjectGetHeader(car);
    while (h->previous)
        h = h->previous;
    int count = 0;
    for (; h; h = h->next)
        if (!strcmp(h->name, classes[field - 1]))
            ++count;
    return count;
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
#ifdef TM3_DARKSIDE_TEST
    if (!strcmp(name, "test_rear_groups"))
        return (OSWord)test_rear_groups;
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(CarMtm3dsSizeof);
    EXPORT(CarMtm3dsDisplayGroupTranslations);
    EXPORT(CarMtm3dsDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3dsConstructor);
    EXPORT(CarMtm3dsProcess);
    EXPORT(CarMtm3dsClassConstructor);
    EXPORT(CarMtm3dsClassDestructor);
    EXPORT(CarMtm3dsWeaponSpecialConstructor);
    return 0;
}
