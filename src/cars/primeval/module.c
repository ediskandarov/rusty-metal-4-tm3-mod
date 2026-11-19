#include "module_import.h"
#include "projectile.h"
#include "tm3/missile.h"
#include "tm3/resources.h"
#include "tm4/main/game.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_weapon.h"
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static const Tm3EngineSettings* engine_settings;
static const CarMount* side_mounts;
void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);
u32 CarMtm3pvSizeof = sizeof(Tm3MissileOwner);
CarNameEntry CarMtm3pvDisplayGroupTranslations[] = { { NULL, -1 } };
s32 CarMtm3pvConstructor(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3pvProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)(car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3pvClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    side_mounts = RegGetFileDataPS(directory, "tm3MissileMounts");
    if (!engine_settings || !side_mounts
        || RegGetFileArraySizePS(directory, "tm3MissileMounts") != 2
        || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(0)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(15))
        abort();
}
void CarMtm3pvClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
s32 CarMtm3pvWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    MATRIX transform;
    SVECTOR inherited;
    Car* target
        = WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, mode, &transform, &inherited);
    static const u32 colors[3] = { 0x000078, 0x000078, 0 };
    static const Tm3MissileDefinition* const profiles[3] = { &Tm3ProjectileType_PrimevalTumbling,
        &Tm3ProjectileType_PrimevalTumbling, &Tm3ProjectileType_PrimevalSkull };
    s32 launched = 0;
    for (u32 slot = 0; slot < 3; ++slot) {
        if (slot) {
            SVECTOR position;
            WEB_MODULE("car", CarLocalPosToWorldPos)
            (car, (SVECTOR*)&side_mounts[slot - 1].position, &position);
            for (s32 axis = 0; axis < 3; ++axis)
                transform.t[axis] = (&position.vx)[axis];
        }
        /* 80032a10 computes an unused -200 Y offset. The first shot still
           starts at attachment 2; profile 23 applies its own -512 Y offset. */
        if (WEB_MODULE("mtm3fx.sym", Tm3MissileLaunch)(
                context, car, target, &transform, mode, profiles[slot], slot, colors[slot]))
            launched = 1;
    }
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3primeval", NULL, car, 1200, 0);
    return launched;
}
static const SnapshotField car_fields[]
    = { SNAP_WEAK_REF(Tm3MissileOwner, projectiles[0], "tm3Missile"),
          SNAP_WEAK_REF(Tm3MissileOwner, projectiles[1], "tm3Missile"),
          SNAP_WEAK_REF(Tm3MissileOwner, projectiles[2], "tm3Missile"),
          SNAP_WEAK_REF(Tm3MissileOwner, projectiles[3], "tm3Missile"), { 0 } };
static const SnapshotType car_snapshot = { .name = "tm3PrimevalCar",
    .size = sizeof(Tm3MissileOwner),
    .fields = car_fields,
    .hash_fields = 1 };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3pvProcess && !car->destructor_callback
            && !car->collision_callback && !car->render_callback
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_PRIMEVAL_TEST
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
        return car->weapons[0].amount;
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
#ifdef TM3_PRIMEVAL_TEST
    if (!strcmp(name, "test_car"))
        return (OSWord)test_car;
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(Tm3ProjectileType_PrimevalTumbling);
    EXPORT(Tm3ProjectileType_PrimevalSkull);
    EXPORT(CarMtm3pvSizeof);
    EXPORT(CarMtm3pvDisplayGroupTranslations);
    EXPORT(CarMtm3pvConstructor);
    EXPORT(CarMtm3pvProcess);
    EXPORT(CarMtm3pvClassConstructor);
    EXPORT(CarMtm3pvClassDestructor);
    EXPORT(CarMtm3pvWeaponSpecialConstructor);
    return 0;
}
