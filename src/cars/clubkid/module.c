#include "mod_api.h"
#include "special.h"
#include "tm3/resources.h"
#include "tm4/main/box.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/os.h"
#include "tm4/main/sound.h"
#include "tm4/modules/car_weapon.h"
#include <STDARG.H>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

typedef struct {
    MATRIX transform;
    s32 age, angle, speed, scale, tint, pitch;
} Vortex;

static const Tm3EngineSettings* engine_settings;
static char vortex_name[] = "tm3ClubVortex";

static void set_pitch(SoundEmitter* sound, s32 pitch)
{
    if (sound)
        for (s32 i = 0; i < sound->voice_count; ++i) {
            SoundEmitterVoice* voice = &sound->voices[i];
            voice->pitch_mode = SOUND_PITCH_FIXED;
            voice->pitch = voice->pitch_base = pitch;
        }
}

static s32 vortex_init(Vortex* vortex, va_list arguments)
{
    const Tm4ShortVectorXYZ* origin = &ObjectGetHeader(ObjectGetHeader(vortex)->owner)->position;
    SVECTOR start = { origin->vx, origin->vy, origin->vz, 0 };
    SVECTOR end = { start.vx, 16384, start.vz, 0 };
    Tm4WorldHit hit = { 0 };
    if (IntersectWorldWithRay(&start, &end, 0, &hit) == 1)
        end.vy = hit.position.vy >> 12;
    *vortex = (Vortex) { .speed = 0xa000, .scale = 512, .pitch = 1200 };
    RotationMatrixY(0, &vortex->transform);
    vortex->transform.t[0] = end.vx;
    vortex->transform.t[1] = end.vy;
    vortex->transform.t[2] = end.vz;
    ObjectSetPosition(vortex, end.vx, end.vy, end.vz);
    ObjectSetInteractionRadius(vortex, 2048);
    set_pitch(
        ObjectCreate("soundEmitter", OBJECT_FOLLOW_OWNER, vortex, "tm3_s04", 0), vortex->pitch);
    return 1;
}

static void vortex_tick(Vortex* vortex)
{
    if (vortex->speed < 0x200000)
        vortex->speed += 0x4000;
    MATRIX* transform = &vortex->transform;
    RotationMatrixY(vortex->angle, transform);
    vortex->angle += (vortex->speed + 2048) >> 12;
    if (vortex->angle > 4096)
        vortex->angle -= 4096;
    vortex->tint
        = ((abs(transform->m[0][2]) - 1) / 16) << 16 | ((abs(transform->m[2][2]) - 1) / 16) << 8;
    for (s32 row = 0; row < 3; ++row)
        for (s32 col = 0; col < 3; ++col)
            transform->m[row][col] = (transform->m[row][col] * vortex->scale + 2048) >> 12;
    if (++vortex->age > 180) {
        ObjectDestroy(vortex);
        return;
    }
    if (vortex->scale < 0x7f80)
        vortex->scale += 128;
    if (vortex->pitch < 9999) {
        vortex->pitch += 40;
        set_pitch(SoundPlaying(vortex, "tm3_s04"), vortex->pitch);
    }
}

static void vortex_car(void* first, void* second)
{
    Car* car = first;
    Tm4ObjectHeader* header = ObjectGetHeader(second);
    Car* owner = header->owner;
    if (car == owner)
        return;
    const Tm4ShortVectorXYZ* p = &ObjectGetHeader(car)->position;
    VECTOR delta = { header->position.vx - p->vx, header->position.vy - p->vy,
        header->position.vz - p->vz, 0 };
    s32 distance = VectorLength0(&delta);
    s32 strength = 256 + 7936 / (distance > 0 ? distance : 1);
    if (car->control_kind != CAR_CONTROL_PLAYER && owner
        && owner->control_kind == CAR_CONTROL_ENEMY)
        strength -= strength / 4;
    SVECTOR normal = { 0 };
    int32_t direction[3] = { delta.vx, delta.vy, delta.vz };
    WEB_MODULE("mtm3fx.sym", Tm3ProjectileNormalize)(direction, &normal.vx);
    SVECTOR tangent = { -normal.vz, normal.vy, normal.vx, 0 };
    VECTOR radial, spin;
    SetVectorDaxpyVS0(&radial, strength, &normal);
    SetVectorDaxpyVS0(&spin, strength / 4, &tangent);
    for (CarParticle* p = car->particles; p < car->particle_end; ++p) {
        p->external_force.vx += radial.vx + spin.vx;
        p->external_force.vy += radial.vy + spin.vy;
        p->external_force.vz += radial.vz + spin.vz;
    }
}

static void vortex_display(
    Vortex* vortex, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DisplayClubVortex(&vortex->transform, vortex->tint, ordering, cursor, limit, view);
}

static void vortex_destroy(Vortex* vortex)
{
    Tm4ObjectHeader* h = ObjectGetHeader(vortex);
    Tm3ExplosionSettings burst = {
        .position = { h->position.vx, h->position.vy - 100, h->position.vz, 0 },
        .material = Tm3Untextured,
        .color = 0x400000,
        .height = 48,
        .inner_ratio_q12 = 1024,
        .speed = 384,
        .duration = 15,
        .radial_force = 2048,
        .lift = 800,
        .affects_owner = 1,
        .once_per_car = 1,
        .owner = h->owner,
        .source = h->participant,
    };
    WEB_MODULE("mtm3fx.sym", Tm3SpawnExplosion)(&burst);
    burst.position.vy -= 100;
    WEB_MODULE("mtm3fx.sym", Tm3SpawnBurstParticles)(&burst.position);
}

CarNameEntry CarMtm3ckDisplayGroupTranslations[] = {
    { NULL, -1 },
};
s32 CarMtm3ckConstructor(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)
    (car, engine_settings);
    return 1;
}
s32 CarMtm3ckProcess(Car* car, void* context)
{
    WEB_MODULE("mtm3fx.sym", Tm3CarTurboProcess)
    (car);
    WEB_MODULE("mtm3fx.sym", Tm3CarEngineProcess)
    (car, engine_settings);
    return 1;
}
void CarMtm3ckClassConstructor(RegistryDirectory* directory)
{
    engine_settings = RegGetFileDataPS(directory, "tm3Engine");
    if (!engine_settings || !WEB_MODULE("mtm3fx.sym", Tm3ResourcesAcquire)()
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(engine_settings->sample)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(0) || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(4)
        || !WEB_MODULE("mtm3fx.sym", Tm3LoadSound)(26))
        abort();
    if (ObjectFindClassIndex(vortex_name) < 0
        && (!ObjectRegisterClass(vortex_name, sizeof(Vortex), directory,
                (Tm4PackedConstructor)vortex_init, NULL, (Tm4ObjectCallback)vortex_tick,
                (Tm4ObjectDisplayCallback)vortex_display, (Tm4ObjectCallback)vortex_destroy)
            || !ObjectRegisterInteractionCallback("car", vortex_name, vortex_car)))
        abort();
}
void CarMtm3ckClassDestructor(RegistryDirectory* directory)
{
    WEB_MODULE("mtm3fx.sym", Tm3ResourcesRelease)
    ();
}
s32 CarMtm3ckWeaponSpecialConstructor(Car* car, void* context, CarWeaponInstance* weapon, s32 mode)
{
    return ObjectCreateWithParticipant(
               vortex_name, OBJECT_HAS_OWNER, ObjectGetHeader(car)->participant, car)
        != NULL;
}

static const SnapshotField vortex_fields[] = {
    SNAP_POD(Vortex, transform.m),
    SNAP_POD(Vortex, transform.t),
    SNAP_POD(Vortex, age),
    SNAP_POD(Vortex, angle),
    SNAP_POD(Vortex, speed),
    SNAP_POD(Vortex, scale),
    SNAP_POD(Vortex, tint),
    SNAP_POD(Vortex, pitch),
    { 0 },
};
static const SnapshotType types[] = {
    { .name = "tm3ClubVortex", .size = sizeof(Vortex), .fields = vortex_fields, .hash_fields = 1 },
    { 0 },
};
static const SnapshotField empty_fields[] = {
    { 0 },
};
static const SnapshotType car_type = { .name = "tm3ClubKidCar", .fields = empty_fields };
static const SnapshotType* car_snapshot_type(const Car* car)
{
    return car->process_callback == CarMtm3ckProcess && !car->render_callback
            && !car->collision_callback && !car->destructor_callback
        ? &car_type
        : NULL;
}
#ifdef TM3_CLUBKID_TEST
static int test_read(Car* car, int field)
{
    if (field == 0)
        return car->weapons[0].amount;
    if (field >= 6 && field <= 9) {
        for (s32 i = 0; i < GameInfo.car_count; ++i) {
            Car* target = GameInfo.cars[i];
            if (target != car)
                return field == 6 ? target->health : target->transform.t[field - 7];
        }
        return -1;
    }
    Tm4ObjectHeader* h = ObjectGetHeader(car);
    while (h->previous)
        h = h->previous;
    for (; h; h = h->next) {
        if (h->owner != car)
            continue;
        if (field == 5 && !strcmp(h->name, "tm3Explosion"))
            return 1;
        if (strcmp(h->name, vortex_name))
            continue;
        Vortex* v = ObjectGetPayload(h);
        switch (field) {
        case 1:
            return v->age;
        case 2:
            return v->scale;
        case 3:
            return v->pitch;
        case 4:
            return v->angle;
        case 10:
        case 11:
        case 12:
            return v->transform.t[field - 10];
        }
    }
    return field == 5 ? 0 : -1;
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
#ifdef TM3_CLUBKID_TEST
    EXPORT(test_select);
    EXPORT(test_read);
#endif
    EXPORT(CarMtm3ckDisplayGroupTranslations);
    EXPORT(CarMtm3ckConstructor);
    EXPORT(CarMtm3ckProcess);
    EXPORT(CarMtm3ckClassConstructor);
    EXPORT(CarMtm3ckClassDestructor);
    EXPORT(CarMtm3ckWeaponSpecialConstructor);
    return 0;
}
