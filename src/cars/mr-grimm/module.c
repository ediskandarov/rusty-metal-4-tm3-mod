#include "module_import.h"
#include "projectile.h"
#include "tm3/missile.h"
#include "tm3/resources.h"
#include "tm4/main/math3d.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_scratch.h"
#include "tm4/modules/car_weapon.h"
#include <LIBETC.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

typedef struct {
    Tm3MissileOwner missiles;
    Tm3BodyAnimation animation;
} GrimmCar;
static const Tm3EngineSettings* engine_settings;
void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);
u32 CarMtm3grSizeof = sizeof(GrimmCar);
CarNameEntry CarMtm3grDisplayGroupTranslations[] = {
    { "tm3_part04", 4 },
    { NULL, -1 },
};
s32 CarMtm3grConstructor(Car* car, void* context)
{
    memset(context, 0, sizeof(GrimmCar));
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3grProcess(Car* car, void* context)
{
    GrimmCar* state = context;
    /* TM3 car+0x72 is the first front wheel steering halfword (80020070). */
    WEB_MODULE("mtm3fx.sym", Tm3BodyAnimate)(Tm3Grimm, &state->animation, car->wheels[0].steering);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3grClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(0)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(15))
        abort();
}
void CarMtm3grClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
s32 CarMtm3grWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, mode, &transform, &inherited);
    Tm3Missile* missile
        = WEB_MODULE("mtm3fx.sym", Tm3MissileLaunch)(&((GrimmCar*)context)->missiles, car, target,
            &transform, mode, &Tm3ProjectileType_Grimm, 0, 0);
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3grimm", NULL, car, 1200, 0);
    return missile != NULL;
}
MATRIX* CarMtm3grDisplaySpecialGroupDisplay(
    Car* car, s32 association, CarRenderGroup* group, MATRIX* lighting, void* context)
{
    GrimmCar* state = context;
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    MATRIX light;
    Tm3BodyPose pose
        = WEB_MODULE("mtm3fx.sym", Tm3BodyGroupPose)(Tm3Grimm, association, &state->animation);
    RotationMatrixY(pose.angle, &scratch->group);
    scratch->group.t[0] = group->center.vector.vx;
    scratch->group.t[1] = group->center.vector.vy;
    scratch->group.t[2] = group->center.vector.vz;
    MulMatrix0(lighting, &scratch->group, &light);
    SetLightMatrix(&light);
    CompMatrix(&scratch->car_to_camera, &scratch->group, &scratch->group);
    return &scratch->group;
}
static const SnapshotField car_fields[] = {
    SNAP_WEAK_REF(GrimmCar, missiles.projectiles[0], "tm3Missile"),
    SNAP_WEAK_REF(GrimmCar, missiles.projectiles[1], "tm3Missile"),
    SNAP_WEAK_REF(GrimmCar, missiles.projectiles[2], "tm3Missile"),
    SNAP_WEAK_REF(GrimmCar, missiles.projectiles[3], "tm3Missile"),
    SNAP_POD(GrimmCar, animation),
    { 0 },
};
static const SnapshotType car_snapshot
    = { .name = "tm3GrimmCar", .size = sizeof(GrimmCar), .fields = car_fields, .hash_fields = 1 };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3grProcess && !car->destructor_callback
            && !car->collision_callback
            && car->render_callback == CarMtm3grDisplaySpecialGroupDisplay
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_GRIMM_TEST
static s32 test_read(Car* car, s32 field)
{
    GrimmCar* state = car->callback_context;
    Tm3Missile* missile = state->missiles.projectiles[0];
    switch (field) {
    case 0:
        return (s32)missile;
    case 1:
        return missile ? missile->flight.age : -1;
    case 2:
        return missile ? missile->linger : -1;
    case 3:
        return WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial)->amount;
    case 4:
        return missile ? (s32)missile->target : 0;
    case 5:
        return missile ? missile->flight.position[0] : 0;
    case 6:
        return missile ? missile->flight.position[2] : 0;
    case 7:
        return missile ? missile->flight.velocity[0] : 0;
    case 8:
        return missile ? missile->flight.velocity[2] : 0;
    case 9:
        return missile ? missile->world_hit : 0;
    case 10:
        return missile ? missile->definition->original_profile : -1;
    case 11:
        return missile ? missile->damage : 0;
    case 12:
        return state->animation.angle;
    case 13:
        return car->wheels[0].steering;
    default:
        return -1;
    }
}
static void test_shift_y(Car* car, s32 offset)
{
    MATRIX placement = car->transform;
    placement.t[1] += offset;
    WEB_MODULE("car", CarOrientWithMatrix)(car, &placement);
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
#ifdef TM3_GRIMM_TEST
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_shift_y"))
        return (OSWord)test_shift_y;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(Tm3ProjectileType_Grimm);
    EXPORT(CarMtm3grSizeof);
    EXPORT(CarMtm3grDisplayGroupTranslations);
    EXPORT(CarMtm3grConstructor);
    EXPORT(CarMtm3grProcess);
    EXPORT(CarMtm3grDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3grClassConstructor);
    EXPORT(CarMtm3grClassDestructor);
    EXPORT(CarMtm3grWeaponSpecialConstructor);
    return 0;
}
