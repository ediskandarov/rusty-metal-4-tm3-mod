#include "module_import.h"
#include "projectile.h"
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
static const CarMount* side_mounts;
void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);
u32 CarMtm3mnSizeof = sizeof(Tm3MissileOwner);
CarNameEntry CarMtm3mnDisplayGroupTranslations[] = {
    { "tm3_part04", 4 },
    { "tm3_part05", 5 },
    { NULL, -1 },
};
s32 CarMtm3mnConstructor(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3mnProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3mnClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    side_mounts = RegGetFileDataPS(directory, "tm3MissileMounts");
    if (!engine_settings || !side_mounts
        || RegGetFileArraySizePS(directory, "tm3MissileMounts") != 2
        || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(0) || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(7)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(15))
        abort();
}
void CarMtm3mnClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
s32 CarMtm3mnWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, mode, &transform, &inherited);
    static const u32 colors[4] = { 0xd00000, 0x000078, 0xc80000, 0xc80000 };
    const Tm3MissileDefinition* const profiles[4] = {
        WEB_MODULE("mtm3fx.sym", Tm3WorldProjectile)(Tm3ProjectileFreeze),
        &Tm3ProjectileType_MinionCentral,
        &Tm3ProjectileType_MinionSide,
        &Tm3ProjectileType_MinionSide,
    };
    MATRIX center = transform;
    s32 launched = 0;
    for (u32 slot = 0; slot < 4; ++slot) {
        if (slot == 0) {
            SVECTOR local = { 0, -200, 0, 0 }, offset;
            ApplyMatrixSV(&car->transform, &local, &offset);
            transform.t[0] += offset.vx;
            transform.t[1] += offset.vy;
            transform.t[2] += offset.vz;
        } else if (slot == 1) {
            transform = center;
        } else {
            SVECTOR position;
            WEB_MODULE("car", CarLocalPosToWorldPos)
            (car, (SVECTOR*)&side_mounts[slot - 2].position, &position);
            transform.t[0] = position.vx;
            transform.t[1] = position.vy;
            transform.t[2] = position.vz;
        }
        if (WEB_MODULE("mtm3fx.sym", Tm3MissileLaunch)(
                context, car, target, &transform, mode, profiles[slot], slot, colors[slot]))
            launched = 1;
    }
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3minion", NULL, car, 1200, 0);
    return launched;
}
MATRIX* CarMtm3mnDisplaySpecialGroupDisplay(
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
static const SnapshotType car_snapshot = {
    .name = "tm3MinionCar", .size = sizeof(Tm3MissileOwner), .fields = car_fields, .hash_fields = 1
};
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3mnProcess && !car->destructor_callback
            && !car->collision_callback
            && car->render_callback == CarMtm3mnDisplaySpecialGroupDisplay
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_MINION_TEST
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
static s32 test_read(Car* car, s32 slot, s32 field)
{
    Tm3MissileOwner* state = car->callback_context;
    Tm3Missile* missile = slot >= 0 && slot < 4 ? state->projectiles[slot] : NULL;
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
        return missile ? missile->damage : 0;
    case 8:
        return missile ? missile->trail.color_step : 0;
    case 9:
        return missile ? missile->world_hit : 0;
    case 10:
        return missile ? missile->definition->original_profile : -1;
    case 11:
        return missile ? missile->flight.speed : 0;
    case 12:
        return missile ? missile->flight.position[1] : 0;
    case 13:
        return GameInfo.players[1].car ? GameInfo.players[1].car->freeze_ticks : -1;
    case 14:
        return GameInfo.players[1].car ? GameInfo.players[1].car->health : -1;
    default:
        return -1;
    }
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
#ifdef TM3_MINION_TEST
    if (!strcmp(name, "test_rear_groups"))
        return (OSWord)test_rear_groups;
    if (!strcmp(name, "test_car"))
        return (OSWord)test_car;
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(Tm3ProjectileType_MinionCentral);
    EXPORT(Tm3ProjectileType_MinionSide);
    EXPORT(CarMtm3mnSizeof);
    EXPORT(CarMtm3mnDisplayGroupTranslations);
    EXPORT(CarMtm3mnDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3mnConstructor);
    EXPORT(CarMtm3mnProcess);
    EXPORT(CarMtm3mnClassConstructor);
    EXPORT(CarMtm3mnClassDestructor);
    EXPORT(CarMtm3mnWeaponSpecialConstructor);
    return 0;
}
