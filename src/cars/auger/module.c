#include "module_import.h"
#include "snapshot_types.h"
#include "tm3/resources.h"
#include "tm4/fixed.h"
#include "tm4/main/game.h"
#include "tm4/main/geometry.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/modules/auger.h"
#include "tm4/modules/car_scratch.h"
#include "tm4/modules/car_weapon.h"
#include <LIBETC.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static const Tm3EngineSettings* engine_settings;
u32 CarMtm3agSizeof = sizeof(AugerDrill);
CarNameEntry CarMtm3agDisplayGroupTranslations[] = {
    { "tm3_part04", 4 },
    { NULL, -1 },
};
s32 CarMtm3agConstructor(Car* car, void* context)
{
    memset(context, 0, sizeof(AugerDrill));
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}
void CarMtm3agClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(26))
        abort();
}
void CarMtm3agClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}
static void set_pitch(AugerDrill* drill, s32 value)
{
    if (!drill->loop_sound)
        return;
    for (s32 i = 0; i < drill->loop_sound->voice_count; ++i) {
        SoundEmitterVoice* voice = &drill->loop_sound->voices[i];
        voice->pitch_mode = SOUND_PITCH_FIXED;
        voice->pitch = voice->pitch_base = value;
    }
}

s32 CarMtm3agWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    AugerDrill* drill = context;
    if (drill->active_ticks > 0)
        return 0;
    drill->active_ticks = 60;
    drill->target = NULL;
    if (!drill->loop_sound)
        drill->loop_sound = ObjectCreate("soundEmitter", OBJECT_FOLLOW_OWNER, car, "tm3auger", 0);
    set_pitch(drill, 1536);
    return 1;
}

static void turn_target(Car* car, AugerDrill* drill)
{
    Car* target = drill->target;
    if (!GameIsCarRegistered(target)
        || DistanceApprox3d(target->transform.t[0] - car->transform.t[0],
               target->transform.t[1] - car->transform.t[1],
               target->transform.t[2] - car->transform.t[2])
            > 1024
        || !WEB_MODULE("car", CarApplyParticipantDamage)(target, car,
            ObjectGetHeader(car)->participant, 15, NULL, "KILLED BY %s'S DRILL", car->name)) {
        drill->target = NULL;
        return;
    }

    drill->angular_speed += Q12MulRound(204, rsin(Q12MulRound(6144, drill->angle))) - 204;
    CarRenderGroup* group = WEB_MODULE("car", CarDisplayGetGroup)(car, 0, 4);
    SVECTOR center;
    ApplyMatrixWithTranslationSV(&car->transform, &group->center.vector, &center);
    SVECTOR axis = { car->transform.m[0][2], car->transform.m[1][2], car->transform.m[2][2], 0 };
    MATRIX rotation;
    AnyAxisAngleToRotMatrix(&center, &axis, drill->angular_speed, &rotation);
    MulMatrix0(&rotation, &target->transform, &target->transform);
    NormalizeMatrix(&target->transform);
    SVECTOR up
        = { target->transform.m[0][1], target->transform.m[1][1], target->transform.m[2][1], 0 };
    AddVectorDaxpyVSS12(target->transform.t, target->collision_box.dimensions.vy / 2, &up, &center);
    WEB_MODULE("car", TransformOriginalBox)(target);
    WEB_MODULE("car", CollideWorldWithCarAtoms)(target);
}

/* TM3 80018054 updates speed and pitch before accumulating the angle. */
s32 CarMtm3agProcess(Car* car, void* context)
{
    AugerDrill* drill = context;
    if (drill->active_ticks > 0) {
        --drill->active_ticks;
        drill->angular_speed = 682;
        if (drill->target)
            turn_target(car, drill);
        set_pitch(drill, 1536 + Q12MulRound(3072, drill->angular_speed));
    } else {
        drill->target = NULL;
        if (drill->angular_speed > 0) {
            set_pitch(drill, 1536 + Q12MulRound(3072, drill->angular_speed));
            drill->angular_speed = drill->angular_speed > 8 ? drill->angular_speed - 8 : 0;
        } else if (drill->loop_sound) {
            ObjectDestroy(drill->loop_sound);
            drill->loop_sound = NULL;
        }
    }
    drill->angle = (drill->angle + drill->angular_speed) & 4095;
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}

u32 InteractCarMtm3agWithCar(Car* car, void* context, Car* other)
{
    AugerDrill* drill = context;
    if (!drill->active_ticks)
        return 0;
    if (!drill->target) {
        MATRIX inverse;
        SVECTOR local;
        InverseMatrix(&car->transform, &inverse);
        ApplyMatrixWithTranslationSV(&inverse, &other->position, &local);
        SVECTOR* center = &car->collision_box.center;
        VECTOR ray = { local.vx - center->vx, local.vy - center->vy, local.vz - center->vz, 0 };
        VECTOR hit;
        VectorNormal(&ray, &ray);
        if (RayThruBox(center, &ray, &car->collision_box.minimum, &car->collision_box.maximum, &hit)
            == RAY_BOX_FACE_MAX_Z)
            drill->target = other;
    }
    return drill->target == other
        ? CAR_COLLISION_SKIP_OTHER_IMPULSE | CAR_COLLISION_SKIP_OWN_IMPULSE
        : 0;
}

MATRIX* CarMtm3agDisplaySpecialGroupDisplay(
    Car* car, s32 association, CarRenderGroup* group, MATRIX* lighting, void* context)
{
    AugerDrill* state = context;
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    MATRIX light;
    RotationMatrixZ(state->angle, &scratch->group);
    scratch->group.t[0] = group->center.vector.vx;
    scratch->group.t[1] = group->center.vector.vy;
    scratch->group.t[2] = group->center.vector.vz;
    MulMatrix0(lighting, &scratch->group, &light);
    SetLightMatrix(&light);
    CompMatrix(&scratch->car_to_camera, &scratch->group, &scratch->group);
    return &scratch->group;
}
static const SnapshotField car_fields[] = {
    SNAP_POD(AugerDrill, angle),
    SNAP_POD(AugerDrill, active_ticks),
    SNAP_POD(AugerDrill, angular_speed),
    SNAP_WEAK_REF(AugerDrill, target, "car"),
    SNAP_REF(AugerDrill, loop_sound, "soundEmitter"),
    { 0 },
};
static const SnapshotType car_snapshot = {
    .name = "tm3AugerDrill", .size = sizeof(AugerDrill), .fields = car_fields, .hash_fields = 1
};
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3agProcess && !car->destructor_callback
            && car->collision_callback == InteractCarMtm3agWithCar
            && car->render_callback == CarMtm3agDisplaySpecialGroupDisplay
        ? &car_snapshot
        : NULL;
}
#ifdef TM3_AUGER_TEST
static s32 test_read(Car* car, s32 field)
{
    AugerDrill* state = car->callback_context;
    switch (field) {
    case 0:
        return state->active_ticks;
    case 1:
        return state->angular_speed;
    case 2:
        return WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial)->amount;
    case 3:
        return state->target && GameIsCarRegistered(state->target);
    case 4:
        return state->angle;
    case 5:
        return state->loop_sound ? state->loop_sound->voices[0].pitch : 0;
    case 6:
        return car->weapons[car->controls.selected_weapon].amount;
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
#ifdef TM3_AUGER_TEST
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(CarMtm3agSizeof);
    EXPORT(InteractCarMtm3agWithCar);
    EXPORT(CarMtm3agDisplayGroupTranslations);
    EXPORT(CarMtm3agConstructor);
    EXPORT(CarMtm3agProcess);
    EXPORT(CarMtm3agDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3agClassConstructor);
    EXPORT(CarMtm3agClassDestructor);
    EXPORT(CarMtm3agWeaponSpecialConstructor);
    return 0;
}
