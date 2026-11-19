#include "tm3/lightning.h"
#include "mod_api.h"
#include "module_import.h"
#include "tm4/main/game.h"
#include "tm4/main/geometry.h"
#include "tm4/main/math3d.h"
#include <stdlib.h>
#include <string.h>
static char bolt_name[] = "tm3OutlawBolt", emitter_name[] = "tm3OutlawEmitter";

static Car* find_car(s32 serial)
{
    for (s32 i = 0; i < GameInfo.car_count; ++i)
        if (ObjectGetHeader(GameInfo.cars[i])->serial == serial)
            return GameInfo.cars[i];
    return NULL;
}

static void bolt_update(OutlawBolt* bolt)
{
    OutlawEmitter* emitter = ObjectGetHeader(bolt)->owner;
    const Tm4ShortVectorXYZ* p = &ObjectGetHeader(emitter)->position;
    SVECTOR end;
    Car* target = find_car(bolt->target_serial);
    if (target) {
        const Tm4ShortVectorXYZ* q = &ObjectGetHeader(target)->position;
        end = (SVECTOR) { q->vx, q->vy, q->vz, 0 };
    } else {
        MATRIX rotation;
        RotationMatrixY(bolt->phase * 128, &rotation);
        SVECTOR local = { (rotation.m[0][0] * 1024 + 2048) >> 12, 64,
            (rotation.m[0][2] * 1024 + 2048) >> 12, 0 };
        ApplyMatrixSV(&emitter->initial_transform, &local, &end);
        end.vx += p->vx;
        end.vy += p->vy;
        end.vz += p->vz;
    }
    VECTOR direction = { end.vx - p->vx, end.vy - p->vy, end.vz - p->vz, 0 };
    s32 length = VectorLength0(&direction);
    s32 spread = length / 2 > 40 ? length / 2 : 40;
    s32 step = length / 16 > 40 ? length / 16 : 40;
    s32 distance = 0;
    memset(bolt->points, 0, sizeof(bolt->points));
    bolt->count = 1;
    while (distance < length && bolt->count < 15) {
        s16* point = bolt->points[bolt->count++];
        s32 increment = rand() % spread;
        distance += increment > step ? increment : step;
        if (distance >= length)
            distance = length;
        else {
            point[0] = rand() % (spread / 8);
            point[2] = rand() % (spread / 8);
        }
        point[1] = distance;
    }
    int32_t delta[3] = { direction.vx, direction.vy, direction.vz };
    s16 axis[3];
    Tm3ProjectileNormalize(delta, axis);
    MATRIX* m = &bolt->transform;
    for (s32 i = 0; i < 3; ++i)
        m->m[i][1] = axis[i];
    m->m[0][0] = axis[2];
    m->m[1][0] = 0;
    m->m[2][0] = -axis[0];
    NormalizeMatrixWithBasis(m, 1, 0);
    m->t[0] = p->vx;
    m->t[1] = p->vy;
    m->t[2] = p->vz;
    ObjectSetPosition(bolt, end.vx, end.vy, end.vz);
    ++bolt->phase;
}

static s32 bolt_init(OutlawBolt* bolt, va_list args)
{
    memset(bolt, 0, sizeof(*bolt));
    bolt->target_serial = va_arg(args, int);
    ObjectSetInteractionRadius(bolt, 128);
    bolt_update(bolt);
    return 1;
}
static void bolt_process(OutlawBolt* bolt)
{
    bolt_update(bolt);
    ++bolt->phase; /* The TM3 process advances again after rebuilding the points. */
}
static void bolt_car(void* first, void* second)
{
    Tm4ObjectHeader* source = ObjectGetHeader(ObjectGetHeader(second)->owner);
    WEB_MODULE("car", CarApplyParticipantDamage)
    (first, source->owner, source->participant,
        ((OutlawEmitter*)ObjectGetHeader(second)->owner)->damage, NULL, NULL);
}
static void bolt_display(
    OutlawBolt* bolt, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DrawOutlawBolt(&bolt->transform, bolt->points, bolt->count, ordering, cursor, limit, view);
}

static OutlawBolt* create_bolt(OutlawEmitter* emitter, s32 target_serial)
{
    return ObjectCreateWithParticipant(bolt_name, OBJECT_DESTROY_WITH_OWNER,
        ObjectGetHeader(emitter)->participant, emitter, target_serial);
}

static s32 emitter_init(OutlawEmitter* emitter, va_list args)
{
    Car* owner = ObjectGetHeader(emitter)->owner;
    memset(emitter, 0, sizeof(*emitter));
    const Tm3LightningSettings* settings = va_arg(args, const Tm3LightningSettings*);
    emitter->range = settings->range;
    emitter->force = settings->force;
    emitter->damage = settings->damage;
    emitter->duration = settings->duration;
    emitter->flash = settings->flash;
    if (settings->transform)
        emitter->initial_transform = *settings->transform;
    else
        IdentifyMatrix(&emitter->initial_transform);
    ObjectSetPosition(emitter, settings->position.vx, settings->position.vy, settings->position.vz);
    Tm3PlayNamedSound(settings->sound, NULL, owner ? emitter : NULL, settings->pitch, 0);
    if (emitter->flash)
        Tm3FlashSet(1, 1);
    emitter->bolts[0] = create_bolt(emitter, -1);
    return emitter->bolts[0] != NULL;
}

static void emitter_targets(OutlawEmitter* emitter)
{
    const Tm4ObjectHeader* h = ObjectGetHeader(emitter);
    for (s32 i = 0; i < GameInfo.car_count; ++i) {
        Car* car = GameInfo.cars[i];
        if (car == h->owner)
            continue;
        Tm4ObjectHeader* target = ObjectGetHeader(car);
        s32 range = DistanceApprox3d(target->position.vx - h->position.vx,
            target->position.vy - h->position.vy, target->position.vz - h->position.vz);
        s32 found = -1, free_slot = -1, idle = -1, active = 0;
        for (s32 j = 0; j < 16; ++j) {
            OutlawBolt* bolt = emitter->bolts[j];
            if (!bolt) {
                free_slot = j;
                continue;
            }
            ++active;
            if (bolt->target_serial == target->serial)
                found = j;
            else if (idle < 0 && !find_car(bolt->target_serial))
                idle = j;
        }
        if (range >= emitter->range) {
            if (found >= 0) {
                if (active == 1)
                    emitter->bolts[found]->target_serial = -1;
                else {
                    ObjectDestroy(emitter->bolts[found]);
                    emitter->bolts[found] = NULL;
                }
            }
        } else if (found < 0) {
            if (idle >= 0)
                emitter->bolts[idle]->target_serial = target->serial;
            else if (free_slot < 0
                || !(emitter->bolts[free_slot] = create_bolt(emitter, target->serial)))
                continue;
            for (CarParticle* p = car->particles; p < car->particle_end; ++p)
                p->external_force.vy += emitter->force;
        }
    }
}

static void emitter_process(OutlawEmitter* emitter)
{
    void* owner = ObjectGetHeader(emitter)->owner;
    if (owner) {
        const Tm4ShortVectorXYZ* p = &ObjectGetHeader(owner)->position;
        ObjectSetPosition(emitter, p->vx, p->vy, p->vz);
    }

    if (emitter->flash)
        Tm3FlashStep(1);
    emitter_targets(emitter);
    ++emitter->age;
    if (emitter->age > emitter->duration) {
        ObjectDestroy(emitter);
        return;
    }
    if (emitter->age % 3 == 0) {
        if (++emitter->frame >= Tm3SpriteFrameCount(4))
            emitter->frame = 0;
    }
    emitter->angle += 256;
    if (emitter->angle > 4096)
        emitter->angle -= 4096;
}
static void emitter_display(
    OutlawEmitter* emitter, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    const Tm4ShortVectorXYZ* p = &ObjectGetHeader(emitter)->position;
    SVECTOR origin = { p->vx, p->vy, p->vz, 0 };
    Tm3DrawOutlawEmitter(emitter->angle, emitter->frame, &origin, ordering, cursor, limit, view);
}
static void destroy_emitter(void* emitter)
{
    if (((OutlawEmitter*)emitter)->flash)
        Tm3FlashSet(1, 0);
}

int Tm3LightningRegister(RegistryDirectory* directory)
{
    if (ObjectFindClassIndex(emitter_name) < 0
        && (!ObjectRegisterClass(bolt_name, sizeof(OutlawBolt), directory,
                (Tm4PackedConstructor)bolt_init, NULL, (Tm4ObjectCallback)bolt_process,
                (Tm4ObjectDisplayCallback)bolt_display, NULL)
            || !ObjectRegisterInteractionCallback("car", bolt_name, bolt_car)
            || !ObjectRegisterClass(emitter_name, sizeof(OutlawEmitter), directory,
                (Tm4PackedConstructor)emitter_init, NULL, (Tm4ObjectCallback)emitter_process,
                (Tm4ObjectDisplayCallback)emitter_display, destroy_emitter)))
        return 0;
    return 1;
}

int Tm3SpawnLightning(const Tm3LightningSettings* settings)
{
    return (settings->owner
                   ? ObjectCreateWithParticipant(emitter_name, OBJECT_DESTROY_WITH_OWNER,
                         ObjectGetHeader(settings->owner)->participant, settings->owner, settings)
                   : ObjectCreate(emitter_name, 0, settings))
        != NULL;
}

const SnapshotField Tm3BoltFields[] = { SNAP_POD(OutlawBolt, transform.m),
    SNAP_POD(OutlawBolt, transform.t), SNAP_POD(OutlawBolt, points), SNAP_POD(OutlawBolt, count),
    SNAP_POD(OutlawBolt, phase), SNAP_POD(OutlawBolt, target_serial), { 0 } };
const SnapshotField Tm3EmitterFields[] = { SNAP_POD(OutlawEmitter, initial_transform.m),
    SNAP_POD(OutlawEmitter, initial_transform.t), SNAP_REF(OutlawEmitter, bolts, "tm3OutlawBolt"),
    SNAP_POD(OutlawEmitter, age), SNAP_POD(OutlawEmitter, angle), SNAP_POD(OutlawEmitter, frame),
    SNAP_POD(OutlawEmitter, duration), SNAP_POD(OutlawEmitter, flash),
    SNAP_POD(OutlawEmitter, range), SNAP_POD(OutlawEmitter, damage), SNAP_POD(OutlawEmitter, force),
    { 0 } };
