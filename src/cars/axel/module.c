#include "module_import.h"
#include "snapshot_types.h"
#include "special.h"
#include "tm3/resources.h"
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
} AxelCar;
static const Tm3EngineSettings* engine_settings;
u32 CarMtm3axSizeof = sizeof(AxelCar);
CarNameEntry CarMtm3axDisplayGroupTranslations[] = {
    { "tm3_part04", 4 },
    { NULL, -1 },
};
s32 CarMtm3axConstructor(Car* car, void* context)
{
    memset(context, 0, sizeof(AxelCar));
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3axProcess(Car* car, void* context)
{
    AxelCar* state = context;
    /* TM3 car+0x72 is the first front wheel steering halfword (80020070). */
    WEB_MODULE("mtm3fx.sym", Tm3BodyAnimate)(Tm3Axel, &state->animation, car->wheels[0].steering);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3axClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(26))
        abort();
}
void CarMtm3axClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
s32 CarMtm3axWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    Tm3SpawnAxelWave(car);
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3axel", NULL, car, 940, 0);
    return 1;
}
MATRIX* CarMtm3axDisplaySpecialGroupDisplay(
    Car* car, s32 association, CarRenderGroup* group, MATRIX* lighting, void* context)
{
    AxelCar* state = context;
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    MATRIX light;
    Tm3BodyPose pose
        = WEB_MODULE("mtm3fx.sym", Tm3BodyGroupPose)(Tm3Axel, association, &state->animation);
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
    SNAP_POD(AxelCar, animation),
    { 0 },
};
static const SnapshotType car_snapshot
    = { .name = "tm3AxelCar", .size = sizeof(AxelCar), .fields = car_fields, .hash_fields = 1 };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3axProcess && !car->destructor_callback
            && !car->collision_callback
            && car->render_callback == CarMtm3axDisplaySpecialGroupDisplay
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_AXEL_TEST
static s32 test_read(Car* car, s32 field)
{
    AxelCar* state = car->callback_context;
    switch (field) {
    case 0:
        return state->animation.angle;
    case 1:
        return car->wheels[0].steering;
    case 2:
        return WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial)->amount;
    case 3:
        return car->health;
    }
    Tm4ObjectHeader* obj = ObjectGetHeader(car);
    while (obj->previous)
        obj = obj->previous;
    for (; obj; obj = obj->next) {
        if (obj->owner != car || strcmp(obj->name, "tm3Explosion"))
            continue;
        switch (field) {
        case 4:
            return obj->interaction_radius;
        case 5:
            return obj->position.vx;
        case 6:
            return obj->position.vy;
        case 7:
            return obj->position.vz;
        }
    }
    return -1;
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
#ifdef TM3_AXEL_TEST
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(CarMtm3axSizeof);
    EXPORT(CarMtm3axDisplayGroupTranslations);
    EXPORT(CarMtm3axConstructor);
    EXPORT(CarMtm3axProcess);
    EXPORT(CarMtm3axDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3axClassConstructor);
    EXPORT(CarMtm3axClassDestructor);
    EXPORT(CarMtm3axWeaponSpecialConstructor);
    return 0;
}
