#include "module_import.h"
#include "snapshot_types.h"
#include "special.h"
#include "tm3/resources.h"
#include "tm4/main/box.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/memory.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/main/registry.h"
#include "tm4/main/sound.h"
#include "tm4/main/system.h"
#include "tm4/modules/car.h"
#include "tm4/modules/car_scratch.h"
#include "tm4/modules/car_weapon.h"
#include <LIBETC.H>
#include <STDARG.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

typedef struct SweetHead SweetHead;
typedef struct {
    Tm3SweetAnimation animation;
    SweetHead* head;
} SweetCar;
struct SweetHead {
    Tm3SweetFlight flight;
    MATRIX transform;
    Car* hit;
    s32 hit_serial;
    u32 hit_distance;
};

void* CarPrepareProjectileLaunch(Car*, CarWeaponInstance*, s32, MATRIX*, SVECTOR*);

static char head_class[] = "tm3SweetHead";
static const Tm3EngineSettings* engine_settings;

u32 CarMtm3swSizeof = sizeof(SweetCar);
CarNameEntry CarMtm3swDisplayGroupTranslations[] = {
    { "tm3_part04", 4 },
    { "tm3_part05", 5 },
    { NULL, -1 },
};

static void add_force(Car* car, const VECTOR* force)
{
    for (CarParticle* atom = car->particles; atom < car->particle_end; ++atom) {
        atom->external_force.vx += force->vx;
        atom->external_force.vy += force->vy;
        atom->external_force.vz += force->vz;
    }
}

static Car* head_owner(SweetHead* head)
{
    Car* owner = ObjectGetHeader(head)->owner;
    return owner && GameIsCarRegistered(owner) ? owner : NULL;
}

static s32 head_constructor(SweetHead* head, va_list arguments)
{
    MATRIX* transform = va_arg(arguments, MATRIX*);
    SVECTOR* velocity = va_arg(arguments, SVECTOR*);
    memset(head, 0, sizeof(*head));
    head->transform = *transform;
    for (s32 axis = 0; axis < 3; ++axis) {
        head->flight.position[axis] = head->flight.previous[axis] = transform->t[axis];
        head->flight.velocity[axis] = (&velocity->vx)[axis];
    }
    ObjectSetPosition(head, transform->t[0], transform->t[1], transform->t[2]);
    ObjectSetInteractionRadius(head, TM3_SWEET_BROAD_PHASE_RADIUS);
    return 1;
}

static void head_destroy(SweetHead* head)
{
    SVECTOR origin;
    Car* car = head_owner(head);
    ObjectCopyPosition(&origin, head);
    Tm3ExplosionSettings explosion = { .position = origin,
        .color = 0x00104060,
        .height = 80,
        .inner_ratio_q12 = 1024,
        .speed = 384,
        .duration = 20,
        .radial_force = 2048,
        .lift = 2000,
        .owner = car,
        .source = ObjectGetHeader(head)->participant,
        .affects_owner = 1,
        .once_per_car = 1 };
    WEB_MODULE("mtm3fx.sym", Tm3SpawnExplosion)(&explosion);
    origin.vy -= 200;
    WEB_MODULE("mtm3fx.sym", Tm3SpawnBurstParticles)(&origin);
    if (car) {
        SweetCar* state = car->callback_context;
        if (state && state->head == head) {
            state->head = NULL;
            /* TM3 freezes the launch cooldown while a remote projectile is active. */
            CarWeaponInstance* special = WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial);
            special->next_time = GetCurrentTime() + special->descriptor->delay;
            if (special->amount > 0)
                --special->amount;
        }
    }
}

static void head_impact(SweetHead* head)
{
    SVECTOR position
        = { head->flight.position[0], head->flight.position[1], head->flight.position[2], 0 };
    WEB_MODULE("mtm3fx.sym", Tm3SpawnSprite)(0, &position, TM3_SWEET_IMPACT_SIZE, NULL, 12, -1);
    ObjectDestroy(head);
}

static void head_process(SweetHead* head)
{
    Car* hit = head->hit;
    if (hit && ObjectValidObject(hit) && ObjectGetHeader(hit)->serial == head->hit_serial) {
        VECTOR force;
        force.vx = head->transform.m[0][2] * 1000;
        force.vy = head->transform.m[1][2] * 1000;
        force.vz = head->transform.m[2][2] * 1000;
        add_force(hit, &force);
        head_impact(head);
        return;
    }
    int expired = Tm3SweetStep(&head->flight);
    SVECTOR trail_position
        = { head->flight.position[0], head->flight.position[1], head->flight.position[2], 0 };
    SVECTOR trail_velocity = { head->flight.velocity[0] / 4, -64, head->flight.velocity[2] / 4, 0 };
    WEB_MODULE("mtm3fx.sym", Tm3SpawnSprite)(5, &trail_position, 128, &trail_velocity, 12, -2);
    if (expired) {
        ObjectSetPosition(
            head, head->flight.midpoint[0], head->flight.midpoint[1], head->flight.midpoint[2]);
        head_impact(head);
        return;
    }
    for (s32 axis = 0; axis < 3; ++axis)
        head->transform.t[axis] = head->flight.position[axis];
    ObjectSetPosition(
        head, head->flight.midpoint[0], head->flight.midpoint[1], head->flight.midpoint[2]);
}

static void head_car(void* first, void* second)
{
    Car* car = first;
    SweetHead* head = second;
    SVECTOR contact;
    if (car == ObjectGetHeader(head)->owner)
        return;
    SVECTOR start
        = { head->flight.previous[0], head->flight.previous[1], head->flight.previous[2], 0 };
    SVECTOR end
        = { head->flight.position[0], head->flight.position[1], head->flight.position[2], 0 };
    if (!IntersectBoxWithSegment(&car->collision_box, &car->transform, &start, &end, &contact))
        return;
    s32 dx = contact.vx - start.vx, dy = contact.vy - start.vy, dz = contact.vz - start.vz;
    u32 distance = (u32)((int64_t)dx * dx + (int64_t)dy * dy + (int64_t)dz * dz);
    if (head->hit && distance >= head->hit_distance)
        return;
    head->hit_distance = distance;
    head->hit = car;
    head->hit_serial = ObjectGetHeader(car)->serial;
}

s32 CarMtm3swConstructor(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}

s32 CarMtm3swProcess(Car* car, void* context)
{
    SweetCar* state = context;
    WEB_MODULE("mtm3fx.sym", Tm3BodyAnimate)(Tm3SweetTooth, &state->animation, 0);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)(car, engine_settings);
    return 1;
}

MATRIX* CarMtm3swDisplaySpecialGroupDisplay(
    Car* car, s32 association, CarRenderGroup* group, MATRIX* lighting, void* context)
{
    SweetCar* state = context;
    CarScratch* scratch = (CarScratch*)getScratchAddr(0);
    MATRIX light;
    Tm3BodyPose pose
        = WEB_MODULE("mtm3fx.sym", Tm3BodyGroupPose)(Tm3SweetTooth, association, &state->animation);
    if (pose.transform == Tm3BodyHidden)
        return NULL;
    RotationMatrixY(pose.angle, &scratch->group);
    scratch->group.t[0] = group->center.vector.vx;
    scratch->group.t[1] = group->center.vector.vy;
    scratch->group.t[2] = group->center.vector.vz;
    MulMatrix0(lighting, &scratch->group, &light);
    SetLightMatrix(&light);
    CompMatrix(&scratch->car_to_camera, &scratch->group, &scratch->group);
    return &scratch->group;
}

static void head_display(
    SweetHead* head, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Car* car = head_owner(head);
    if (!car)
        return;
    WEB_MODULE("mtm3fx.sym", Tm3DisplayCarGroups)
    (car, 4, &head->transform, ordering, cursor, limit, view);
}

void CarMtm3swClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(0)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(26))
        abort();
    if (ObjectFindClassIndex(head_class) < 0) {
        ObjectRegisterClass(head_class, sizeof(SweetHead), directory,
            (Tm4PackedConstructor)head_constructor, NULL, (Tm4ObjectCallback)head_process,
            (Tm4ObjectDisplayCallback)head_display, (Tm4ObjectCallback)head_destroy);
        ObjectRegisterInteractionCallback("car", head_class, head_car);
    }
}

void CarMtm3swClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)();
}

void CarMtm3swDestructor(Car* car, void* context)
{
    SweetCar* state = context;
    if (state && state->head) {
        ObjectSetOwner(state->head, NULL);
        ObjectDestroy(state->head);
        state->head = NULL;
    }
}

s32 CarMtm3swWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    SweetCar* state = context;
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3sweet", NULL, car, 1200, 0);
    if (state->head) {
        head_impact(state->head);
        return 0;
    }
    MATRIX transform;
    SVECTOR inherited, velocity;
    WEB_MODULE("car", CarPrepareProjectileLaunch)(car, weapon, mode, &transform, &inherited);
    int16_t forward[3] = { transform.m[0][2], transform.m[1][2], transform.m[2][2] };
    const CarParticle* body = car->particle_end - 1;
    int32_t body_velocity[3]
        = { body->velocity_q12.vx, body->velocity_q12.vy, body->velocity_q12.vz };
    int16_t components[3];
    Tm3SweetLaunchVelocity(forward, body_velocity, mode, components);
    velocity.vx = components[0];
    velocity.vy = components[1];
    velocity.vz = components[2];
    state->head = ObjectCreate(head_class, 1, car, &transform, &velocity);
    /* Active heads bypass TM3's cooldown gate (80018768 / 80033e18). */
    if (state->head)
        weapon->next_time = 0;
    if (state->head && !mode) {
        VECTOR recoil = { -transform.m[0][2] * TM3_SWEET_RECOIL,
            -transform.m[1][2] * TM3_SWEET_RECOIL, -transform.m[2][2] * TM3_SWEET_RECOIL, 0 };
        add_force(car, &recoil);
    }
    /* TM3 consumes this attack's ammunition on projectile destruction, not launch. */
    return 0;
}

static const SnapshotField car_fields[] = {
    SNAP_POD(SweetCar, animation),
    SNAP_REF(SweetCar, head, "tm3SweetHead"),
    { 0 },
};
static const SnapshotField head_fields[] = {
    SNAP_POD(SweetHead, flight),
    SNAP_POD(SweetHead, transform.m),
    SNAP_POD(SweetHead, transform.t),
    SNAP_WEAK_REF(SweetHead, hit, "car"),
    SNAP_POD(SweetHead, hit_serial),
    SNAP_POD(SweetHead, hit_distance),
    { 0 },
};
static const SnapshotType snapshot_types[] = {
    { .name = "tm3SweetHead", .size = sizeof(SweetHead), .fields = head_fields, .hash_fields = 1 },
    { 0 },
};
static const SnapshotType car_snapshot
    = { .name = "tm3SweetCar", .size = sizeof(SweetCar), .fields = car_fields, .hash_fields = 1 };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3swProcess
            && car->destructor_callback == CarMtm3swDestructor && !car->collision_callback
            && car->render_callback == CarMtm3swDisplaySpecialGroupDisplay
        ? &car_snapshot
        : NULL;
}

#ifdef TM3_SWEET_TEST
static s32 test_read(Car* car, s32 field)
{
    SweetCar* state = car->callback_context;
    SweetHead* head = state->head;
    switch (field) {
    case 0:
        return (s32)head;
    case 1:
        return head ? head->flight.age : -1;
    case 2:
        return state->animation.angle;
    case 3:
        return state->animation.frame;
    case 4:
        return WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial)->amount;
    case 5:
        return head ? head->flight.position[0] : 0;
    case 6:
        return head ? head->flight.position[2] : 0;
    case 7:
        return car->turbo_fuel;
    case 8:
        return car->controls.turbo_active;
    case 9:
        return SoundGetProgramId(car->engine_sound_name);
    case 10:
        return (s32)car->engine_sound;
    case 11:
        return car->engine_sound ? car->engine_sound->voices[0].pitch : -1;
    case 12:
        return car->force_sum;
    case 13: {
        SoundVagAttr attr;
        s32 program = SoundGetProgramId(car->engine_sound_name);
        return program >= 0 && SoundProgramIdGetVagAttr(program, 0, &attr) == 1 ? attr.loop : -1;
    }
    case 14:
        return car->engine_sound ? car->engine_sound->voices[0].volume : -1;
    case 15:
        return car->engine_sound ? car->engine_sound->voices[0].duration_frames : 0;
    case 16:
        return car->engine_sound ? car->engine_sound->voices[0].voice_id : -1;
    case 17:
        return WEB_MODULE("car", CarWeaponForRole)(car, CarWeaponSpecial)->next_time
            - GetCurrentTime();
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
    if (!strcmp(name, "__rm4_snapshot_types"))
        return (OSWord)snapshot_types;
    if (!strcmp(name, "__rm4_car_snapshot_type"))
        return (OSWord)car_snapshot_type;
#ifdef TM3_SWEET_TEST
    if (!strcmp(name, "test_read"))
        return (OSWord)test_read;
    if (!strcmp(name, "test_select"))
        return (OSWord)test_select;
#endif
    EXPORT(CarMtm3swSizeof);
    EXPORT(CarMtm3swDisplayGroupTranslations);
    EXPORT(CarMtm3swClassConstructor);
    EXPORT(CarMtm3swClassDestructor);
    EXPORT(CarMtm3swConstructor);
    EXPORT(CarMtm3swProcess);
    EXPORT(CarMtm3swDestructor);
    EXPORT(CarMtm3swDisplaySpecialGroupDisplay);
    EXPORT(CarMtm3swWeaponSpecialConstructor);
    return 0;
}
