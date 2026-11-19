#include "module_import.h"
#include "projectile.h"
#include "tm3/missile.h"
#include "tm3/resources.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_weapon.h"
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static const Tm3EngineSettings* engine_settings;
void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);
u32 CarMtm3fpSizeof = sizeof(Tm3MissileOwner);
CarNameEntry CarMtm3fpDisplayGroupTranslations[] = {
    { NULL, -1 },
};
s32 CarMtm3fpConstructor(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3fpProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)(car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3fpClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(0))
        abort();
}
void CarMtm3fpClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
s32 CarMtm3fpWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, mode, &transform, &inherited);
    Tm3Missile* missile = WEB_MODULE("mtm3fx.sym", Tm3MissileLaunch)(
        context, car, target, &transform, mode, &Tm3ProjectileType_Flower, 0, 0);
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3flower", NULL, car, 1200, 0);
    return missile != NULL;
}
static const SnapshotField car_fields[] = {
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[0], "tm3Missile"),
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[1], "tm3Missile"),
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[2], "tm3Missile"),
    SNAP_WEAK_REF(Tm3MissileOwner, projectiles[3], "tm3Missile"),
    { 0 },
};
static const SnapshotType car_snapshot = {
    .name = "tm3FlowerCar", .size = sizeof(Tm3MissileOwner), .fields = car_fields, .hash_fields = 1
};
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3fpProcess && !car->destructor_callback
            && !car->collision_callback && !car->render_callback
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_FLOWER_TEST
static s32 test_read(Car* car, s32 field)
{
    Tm3MissileOwner* state = car->callback_context;
    Tm3Missile* missile = state->projectiles[0];
    switch (field) {
    case 0:
        return (s32)missile;
    case 1:
        return missile ? missile->flight.age : -1;
    case 2:
        return missile ? missile->linger : -1;
    case 3:
        return car->weapons[0].amount;
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
#ifdef TM3_FLOWER_TEST
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_shift_y"))
        return (OSWord)test_shift_y;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(Tm3ProjectileType_Flower);
    EXPORT(CarMtm3fpSizeof);
    EXPORT(CarMtm3fpDisplayGroupTranslations);
    EXPORT(CarMtm3fpConstructor);
    EXPORT(CarMtm3fpProcess);
    EXPORT(CarMtm3fpClassConstructor);
    EXPORT(CarMtm3fpClassDestructor);
    EXPORT(CarMtm3fpWeaponSpecialConstructor);
    return 0;
}
