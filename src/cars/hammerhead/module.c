#include "module_import.h"
#include "snapshot_types.h"
#include "tm3/resources.h"
#include "tm4/main/game.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_weapon.h"
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static const Tm3EngineSettings* engine_settings;
typedef struct {
    s32 ticks, mode;
    s32 hit_serials[ArrayCount(GameInfo.cars)];
} Hammerhead;
u32 CarMtm3hhSizeof = sizeof(Hammerhead);
CarNameEntry CarMtm3hhDisplayGroupTranslations[] = {
    { NULL, -1 },
};
s32 CarMtm3hhConstructor(Car* car, void* context)
{
    memset(context, 0, sizeof(Hammerhead));
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
s32 CarMtm3hhProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)(car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3hhClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(26))
        abort();
}
void CarMtm3hhClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
void CarMtm3hhPrepareWeaponInput(Car* car, void* context)
{
    Hammerhead* state = context;
    if (state->ticks > 0) {
        --state->ticks;
        car->controls.weapon_pressed = 0;
        car->controls.weapon_held = 0;
    } else {
        memset(state->hit_serials, 0, sizeof(state->hit_serials));
    }
}

static s16 ram_axis(const Car* car, s32 mode, int axis)
{
    s16 forward = car->transform.m[axis][2];
    return mode == 1 ? (s16)-forward : forward;
}

s32 CarMtm3hhWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    Hammerhead* state = context;
    const s32 x = ram_axis(car, mode, 0) * 4096;
    const s32 y = ram_axis(car, mode, 1) * 4096;
    const s32 z = ram_axis(car, mode, 2) * 4096;
    for (CarParticle* p = car->particles; p < car->particle_end; ++p) {
        p->net_force.vx += x;
        p->net_force.vy += y;
        p->net_force.vz += z;
    }
    state->ticks = 60;
    state->mode = mode;
    /* TM3 SoundLoadVab maps the first Hammerhead tone (center 84) to pitch 981. */
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3hammerhead", NULL, car, 981, 0);
    return 1;
}

static int closing_on_target(const Car* car, const Car* other, s32 mode)
{
    u32 motion = 0, relative = 0;
    for (int axis = 0; axis < 3; ++axis) {
        s16 direction = ram_axis(car, mode, axis);
        s16 own = (s16)(car->transform.t[axis] - car->previous_transform.t[axis]);
        s16 target = (s16)(other->transform.t[axis] - other->previous_transform.t[axis]);
        motion += (u32)(direction * own);
        relative += (u32)(direction * (s16)(own - target));
    }
    return (s32)motion > 0 && (s32)relative > 0;
}

static int registered_serial(s32 serial)
{
    for (int i = 0; i < GameInfo.car_count; ++i) {
        Car* car = GameInfo.cars[i];
        if (car && ObjectGetHeader(car)->serial == serial)
            return 1;
    }
    return 0;
}

u32 InteractCarMtm3hhWithCar(Car* car, void* context, Car* target)
{
    Hammerhead* state = context;
    if (state->ticks <= 0 || !closing_on_target(car, target, state->mode))
        return 0;
    s32 serial = ObjectGetHeader(target)->serial;
    for (int i = 0; i < ArrayCount(state->hit_serials); ++i) {
        if (state->hit_serials[i] == serial)
            return 0;
    }
    for (int i = 0; i < ArrayCount(state->hit_serials); ++i) {
        if (state->hit_serials[i] && registered_serial(state->hit_serials[i]))
            continue;
        state->hit_serials[i] = serial;
        if (!WEB_MODULE("car", CarApplyParticipantDamage)(target, car,
                ObjectGetHeader(car)->participant, 600, NULL, "KILLED BY %s'S LUNGE", car->name))
            return CAR_COLLISION_END_CONTACT;
        break;
    }
    return 0;
}

static const SnapshotField car_fields[] = {
    SNAP_POD(Hammerhead, ticks),
    SNAP_POD(Hammerhead, mode),
    SNAP_POD(Hammerhead, hit_serials),
    { 0 },
};
static const SnapshotType car_snapshot = {
    .name = "tm3HammerheadCar", .size = sizeof(Hammerhead), .fields = car_fields, .hash_fields = 1
};
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3hhProcess && !car->destructor_callback
            && car->collision_callback == InteractCarMtm3hhWithCar && !car->render_callback
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_HAMMERHEAD_TEST
static s32 test_read(Car* car, s32 field)
{
    const Hammerhead* state = car->callback_context;
    switch (field) {
    case 0:
        return state->ticks;
    case 1:
        return state->mode;
    case 2:
        return car->weapons[0].amount;
    case 3:
        return state->hit_serials[0];
    case 4:
        return GameInfo.players[1].car != NULL;
    default:
        return -1;
    }
}
static void test_weaken_target(void)
{
    if (GameInfo.players[1].car)
        GameInfo.players[1].car->health = 500;
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
#ifdef TM3_HAMMERHEAD_TEST
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_weaken_target"))
        return (OSWord)test_weaken_target;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(CarMtm3hhSizeof);
    EXPORT(CarMtm3hhDisplayGroupTranslations);
    EXPORT(CarMtm3hhConstructor);
    EXPORT(CarMtm3hhProcess);
    EXPORT(CarMtm3hhClassConstructor);
    EXPORT(CarMtm3hhClassDestructor);
    EXPORT(CarMtm3hhWeaponSpecialConstructor);
    EXPORT(CarMtm3hhPrepareWeaponInput);
    EXPORT(InteractCarMtm3hhWithCar);
    return 0;
}
