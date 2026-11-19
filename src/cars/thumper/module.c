#include "mod_api.h"
#include "special.h"
#include "tm3/resources.h"
#include "tm4/main/box.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/modules/car_weapon.h"
#include "tm4/modules/destry.h"
#include <STDARG.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

static const Tm3EngineSettings* engine_settings;
static const CarMount* nozzle;
static char emitter_name[] = "tm3ThumperEmitter", segment_name[] = "tm3ThumperSegment";
typedef struct {
    s32 age;
} Emitter;
typedef struct {
    MATRIX transform;
    SVECTOR end, velocity;
    s32 frame, age;
} Segment;

static s32 segment_init(Segment* segment, va_list args)
{
    Car* car = ObjectGetHeader(segment)->owner;
    segment->transform = car->transform;
    segment->frame = va_arg(args, int);
    segment->age = 0;
    WEB_MODULE("car", CarLocalPosToWorldPos)
    (car, (SVECTOR*)&nozzle->position, &segment->end);
    s16 forward[3] = { car->transform.m[0][2], car->transform.m[1][2], car->transform.m[2][2] };
    const CarParticle* body = car->particle_end - 1;
    s32 velocity[3] = { body->velocity_q12.vx, body->velocity_q12.vy, body->velocity_q12.vz };
    const Tm3ProjectileTuning tuning = { .speed = 4000 };
    WEB_MODULE("mtm3fx.sym", Tm3ProjectileLaunchVelocity)
    (&tuning, forward, velocity, 0, &segment->velocity.vx);
    ObjectSetPosition(segment, segment->end.vx, segment->end.vy, segment->end.vz);
    ObjectSetInteractionRadius(segment, 100);
    return 1;
}
static void segment_tick(Segment* segment)
{
    SVECTOR previous = segment->end;
    AddVectorDaxpySSS12(&segment->end, 136, &segment->velocity, &previous);
    VECTOR delta = { segment->end.vx - previous.vx, segment->end.vy - previous.vy,
        segment->end.vz - previous.vz, 0 };
    for (int i = 0; i < 3; ++i)
        segment->transform.t[i] = ((&segment->end.vx)[i] + (&previous.vx)[i]) / 2;
    ObjectSetPosition(
        segment, segment->transform.t[0], segment->transform.t[1], segment->transform.t[2]);
    int half = (int)VectorLength0(&delta) / 2;
    ObjectSetInteractionRadius(segment, half > 100 ? half : 100);
    Tm4WorldHit hit = { 0 };
    if (IntersectWorldWithRay(&previous, &segment->end, 0, &hit) == 1) {
        if (hit.owner && !strcmp(ObjectGetHeader(hit.owner)->name, "destroyable"))
            WEB_MODULE("destry", DestroyableApplyDamage)
        (hit.owner, 16, segment->end.vx, segment->end.vy, segment->end.vz);
        ObjectDestroy(segment);
        return;
    }
    if (segment->age++ > 15)
        ObjectDestroy(segment);
}
static void segment_display(
    Segment* segment, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DrawThumperSegment(
        &segment->transform, segment->frame, segment->age, ordering, cursor, limit, view);
}
static void segment_car(void* first, void* second)
{
    Car* car = first;
    Segment* segment = second;
    Tm4ObjectHeader* header = ObjectGetHeader(segment);
    if (car == header->owner)
        return;
    SVECTOR axis
        = { segment->transform.m[0][2], segment->transform.m[1][2], segment->transform.m[2][2], 0 };
    if (!WEB_MODULE("car", CarApplyParticipantDamage)(
            car, header->owner, header->participant, 16, NULL, NULL))
        return;
    VECTOR force;
    SetVectorDaxpyVS0(&force, 16 * 8, &axis);
    for (CarParticle* p = car->particles; p < car->particle_end; ++p) {
        p->external_force.vx += force.vx;
        p->external_force.vy += force.vy;
        p->external_force.vz += force.vz;
    }
}
static s32 emitter_init(Emitter* emitter, va_list args)
{
    emitter->age = 0;
    return 1;
}
static void emitter_tick(Emitter* emitter)
{
    if (emitter->age >= 15) {
        ObjectDestroy(emitter);
        return;
    }
    Tm4ObjectHeader* h = ObjectGetHeader(emitter);
    int frame = ++emitter->age % 3;
    ObjectCreateWithParticipant(segment_name, OBJECT_HAS_OWNER, h->participant, h->owner, frame);
}
CarNameEntry CarMtm3thDisplayGroupTranslations[] = { { NULL, -1 } };
s32 CarMtm3thConstructor(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)
    (car, engine_settings);
    return 1;
}
s32 CarMtm3thProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)
    (car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)
    (car, engine_settings);
    return 1;
}
void CarMtm3thClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    nozzle = RegGetFileDataPS(directory, "TM3Thumper");
    if (!engine_settings || !nozzle || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(26))
        abort();
    if (ObjectFindClassIndex(segment_name) < 0
        && (!ObjectRegisterClass(segment_name, sizeof(Segment), directory,
                (Tm4PackedConstructor)segment_init, NULL, (Tm4ObjectCallback)segment_tick,
                (Tm4ObjectDisplayCallback)segment_display, NULL)
            || !ObjectRegisterInteractionCallback("car", segment_name, segment_car)
            || !ObjectRegisterClass(emitter_name, sizeof(Emitter), directory,
                (Tm4PackedConstructor)emitter_init, NULL, (Tm4ObjectCallback)emitter_tick, NULL,
                NULL)))
        abort();
}
void CarMtm3thClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)
    ();
}
s32 CarMtm3thWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    void* emitter = ObjectCreateWithParticipant(emitter_name,
        OBJECT_HAS_OWNER | OBJECT_DESTROY_WITH_OWNER, ObjectGetHeader(car)->participant, car);
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)
    ("tm3thumper", NULL, car, 1200, 0);
    return emitter != NULL;
}
static const SnapshotField segment_fields[] = { SNAP_POD(Segment, transform.m),
    SNAP_POD(Segment, transform.t), SNAP_POD(Segment, end.vx), SNAP_POD(Segment, end.vy),
    SNAP_POD(Segment, end.vz), SNAP_POD(Segment, velocity.vx), SNAP_POD(Segment, velocity.vy),
    SNAP_POD(Segment, velocity.vz), SNAP_POD(Segment, frame), SNAP_POD(Segment, age), { 0 } };
static const SnapshotField emitter_fields[] = { SNAP_POD(Emitter, age), { 0 } };
static const SnapshotType types[] = { { .name = "tm3ThumperSegment",
                                          .size = sizeof(Segment),
                                          .fields = segment_fields,
                                          .hash_fields = 1 },
    { .name = "tm3ThumperEmitter",
        .size = sizeof(Emitter),
        .fields = emitter_fields,
        .hash_fields = 1 },
    { 0 } };
static const SnapshotField empty_fields[] = { { 0 } };
static const SnapshotType car_type = { .name = "tm3ThumperCar", .fields = empty_fields };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3thProcess && !car->render_callback
            && !car->collision_callback && !car->destructor_callback
        ? &car_type
        : NULL;
}
#ifdef TM3_THUMPER_TEST
static int test_read(Car* car, int field)
{
    if (field == 0)
        return car->weapons[0].amount;
    int count = 0, age = -1, newest = -1, frame = -1;
    Tm4ObjectHeader* h = ObjectGetHeader(car);
    while (h->previous)
        h = h->previous;
    for (; h; h = h->next) {
        if (h->owner != car)
            continue;
        if (!strcmp(h->name, emitter_name))
            age = ((Emitter*)ObjectGetPayload(h))->age;
        if (!strcmp(h->name, segment_name)) {
            ++count;
            if (h->serial > newest) {
                newest = h->serial;
                frame = ((Segment*)ObjectGetPayload(h))->frame;
            }
        }
    }
    return field == 1 ? age : field == 2 ? count : frame;
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
        return (OSWord)types;
    if (!strcmp(name, "__rm4_car_snapshot_type"))
        return (OSWord)car_snapshot_type;
#ifdef TM3_THUMPER_TEST
    EXPORT(test_select);
    EXPORT(test_read);
#endif
    EXPORT(CarMtm3thDisplayGroupTranslations);
    EXPORT(CarMtm3thConstructor);
    EXPORT(CarMtm3thProcess);
    EXPORT(CarMtm3thClassConstructor);
    EXPORT(CarMtm3thClassDestructor);
    EXPORT(CarMtm3thWeaponSpecialConstructor);
    return 0;
}
