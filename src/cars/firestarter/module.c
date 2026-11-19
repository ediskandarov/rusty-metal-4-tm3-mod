#include "module_import.h"
#include "snapshot_types.h"
#include "tm3/resources.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_scratch.h"
#include "tm4/modules/car_weapon.h"
#include <LIBETC.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

typedef struct {
    Tm3BodyAnimation animation;
} FirestarterCar;
static const Tm3EngineSettings* engine_settings;
static const CarMount* nozzle;
u32 CarMtm3fsSizeof = sizeof(FirestarterCar);
CarNameEntry CarMtm3fsDisplayGroupTranslations[] = { { "tm3_part04", 4 }, { NULL, -1 } };
s32 CarMtm3fsConstructor(Car* car, void* context)
{
    memset(context, 0, sizeof(FirestarterCar));
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3fsProcess(Car* car, void* context)
{
    FirestarterCar* state = context;
    /* TM3 car+0x72 is the first front wheel steering halfword (80020070). */
    WEB_MODULE("mtm3fx.sym", Tm3BodyAnimate)
    (Tm3Firestarter, &state->animation, car->wheels[0].steering);
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)(car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3fsClassConstructor(RegistryDirectory* directory)
{
    nozzle = RegGetFileDataPS(directory, "TM3Firestarter");
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!nozzle || !engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(10)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(26))
        abort();
}
void CarMtm3fsClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
s32 CarMtm3fsWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    int flames = WEB_MODULE("mtm3fx.sym", Tm3StartFlamer)(car, &nozzle->position);
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)
    ("tm3firestarter", NULL, car, 1300, 0);
    return flames;
}
MATRIX* CarMtm3fsDisplaySpecialGroupDisplay(
    Car* car, s32 association, CarRenderGroup* group, MATRIX* lighting, void* context)
{
    FirestarterCar* state = context;
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    MATRIX light;
    Tm3BodyPose pose = WEB_MODULE("mtm3fx.sym", Tm3BodyGroupPose)(
        Tm3Firestarter, association, &state->animation);
    RotationMatrixY(pose.angle, &scratch->group);
    scratch->group.t[0] = group->center.vector.vx;
    scratch->group.t[1] = group->center.vector.vy;
    scratch->group.t[2] = group->center.vector.vz;
    MulMatrix0(lighting, &scratch->group, &light);
    SetLightMatrix(&light);
    CompMatrix(&scratch->car_to_camera, &scratch->group, &scratch->group);
    return &scratch->group;
}
static const SnapshotField car_fields[] = { SNAP_POD(FirestarterCar, animation), { 0 } };
static const SnapshotType car_snapshot = { .name = "tm3FirestarterCar",
    .size = sizeof(FirestarterCar),
    .fields = car_fields,
    .hash_fields = 1 };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3fsProcess && !car->destructor_callback
            && !car->collision_callback
            && car->render_callback == CarMtm3fsDisplaySpecialGroupDisplay
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_FIRESTARTER_TEST
static s32 test_read(Car* car, s32 field)
{
    if (field == 0)
        return car->weapons[0].amount;
    if (field == 5)
        return GameInfo.players[1].car ? GameInfo.players[1].car->freeze_ticks : 0;
    if (field == 6)
        return ((FirestarterCar*)car->callback_context)->animation.angle;
    if (field == 7)
        return car->wheels[0].steering;
    if (field == 8)
        return car->turbo_fuel;
    if (field == 9)
        return car->health;
    if (field == 10)
        return car->turbo_thrust_applied;
    if (field == 11) {
        for (Tm4ObjectHeader* h = ObjectGetHeader(car)->next; h; h = h->next)
            if (h->owner == car && !strcmp(h->name, "tm3Burn"))
                return h->serial;
        return -1;
    }
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
static void* test_ground_fire(Car* car)
{
    SVECTOR position = { 0 };
    ObjectCopyPosition(&position, car);
    return ObjectCreateWithParticipant(
        "tm3GroundFire", 0, ObjectGetHeader(car)->participant, &position, 300, 8);
}
static void test_set_fuel(Car* car, s32 fuel)
{
    car->turbo_fuel = fuel;
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
#ifdef TM3_FIRESTARTER_TEST
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_ground_fire"))
        return (OSWord)test_ground_fire;
    if (!strcmp(name, "test_remove_fire"))
        return (OSWord)ObjectDestroy;
    if (!strcmp(name, "test_set_fuel"))
        return (OSWord)test_set_fuel;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(CarMtm3fsSizeof);
    EXPORT(CarMtm3fsDisplayGroupTranslations);
    EXPORT(CarMtm3fsConstructor);
    EXPORT(CarMtm3fsProcess);
    EXPORT(CarMtm3fsDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3fsClassConstructor);
    EXPORT(CarMtm3fsClassDestructor);
    EXPORT(CarMtm3fsWeaponSpecialConstructor);
    return 0;
}
