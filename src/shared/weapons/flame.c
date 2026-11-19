#include "flame.h"
#include "mod_api.h"
#include "module_import.h"
#include "tm3/resources.h"
#include "tm4/fixed.h"
#include "tm4/main/box.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/system.h"
#include "tm4/modules/car_effect.h"
#include "tm4/modules/destry.h"
#include <STDARG.H>
#include <string.h>

static char emitter_name[] = "tm3Flamer", flame_name[] = "tm3Flame", burn_name[] = "tm3Burn",
            ground_name[] = "tm3GroundFire";
static void origin_and_velocity(Car* car, const SVECTOR* mount, SVECTOR* origin, SVECTOR* velocity)
{
    SVECTOR local = *mount;
    local.vz += (rand() & 15) - 8;
    ApplyMatrixSV(&car->transform, &local, origin);
    origin->vx += car->transform.t[0];
    origin->vy += car->transform.t[1];
    origin->vz += car->transform.t[2];
    int16_t forward[3] = { car->transform.m[0][2], car->transform.m[1][2], car->transform.m[2][2] };
    const CarParticle* body = car->particle_end - 1;
    int32_t inherited[3] = { body->velocity_q12.vx, body->velocity_q12.vy, body->velocity_q12.vz };
    const Tm3ProjectileTuning nozzle = { .speed = 2400 };
    Tm3ProjectileLaunchVelocity(&nozzle, forward, inherited, 0, &velocity->vx);
}
static s32 emitter_init(Emitter* emitter, va_list args)
{
    emitter->mount = *va_arg(args, const SVECTOR*);
    emitter->age = 0;
    SVECTOR origin, velocity;
    origin_and_velocity(ObjectGetHeader(emitter)->owner, &emitter->mount, &origin, &velocity);
    ObjectSetPosition(emitter, origin.vx, origin.vy, origin.vz);
    return 1;
}
static void emitter_tick(Emitter* emitter)
{
    Car* owner = ObjectGetHeader(emitter)->owner;
    SVECTOR origin = { 0 }, velocity = { 0 };
    origin_and_velocity(owner, &emitter->mount, &origin, &velocity);
    ObjectSetPosition(emitter, origin.vx, origin.vy, origin.vz);
    ObjectCreateWithParticipant(flame_name, OBJECT_HAS_OWNER, ObjectGetHeader(emitter)->participant,
        owner, &origin, &velocity);
    /* 800295a8 compares the previous age strictly against 30. */
    if (emitter->age++ > 30)
        ObjectDestroy(emitter);
}
int Tm3StartFlamer(Car* owner, const SVECTOR* mount)
{
    return ObjectCreateWithParticipant(emitter_name, OBJECT_HAS_OWNER | OBJECT_DESTROY_WITH_OWNER,
               ObjectGetHeader(owner)->participant, owner, mount)
        != NULL;
}
static s32 flame_init(Flame* flame, va_list args)
{
    flame->end = *va_arg(args, const SVECTOR*);
    flame->velocity = *va_arg(args, const SVECTOR*);
    flame->age = flame->elapsed = 0;
    flame->size = 80;
    flame->frame = Tm3SpriteFrameCount(0) - 1;
    ObjectSetPosition(flame, flame->end.vx, flame->end.vy, flame->end.vz);
    ObjectSetInteractionRadius(flame, 80);
    return 1;
}
static void flame_tick(Flame* flame)
{
    SVECTOR previous = flame->end;
    AddVectorDaxpySSS12(&flame->end, 136, &flame->velocity, &previous);
    VECTOR delta = { flame->end.vx - previous.vx, flame->end.vy - previous.vy,
        flame->end.vz - previous.vz, 0 };
    ObjectSetPosition(flame, (previous.vx + flame->end.vx) / 2, (previous.vy + flame->end.vy) / 2,
        (previous.vz + flame->end.vz) / 2);
    int half = (int)VectorLength0(&delta) / 2;
    ObjectSetInteractionRadius(flame, half > 80 ? half : 80);
    Tm4WorldHit hit = { 0 };
    if (IntersectWorldWithRay(&previous, &flame->end, 0, &hit) == 1) {
        if (hit.owner && !strcmp(ObjectGetHeader(hit.owner)->name, "destroyable"))
            WEB_MODULE("destry", DestroyableApplyDamage)
        (hit.owner, 4, flame->end.vx, flame->end.vy, flame->end.vz);
        ObjectDestroy(flame);
        return;
    }
    if (flame->age > 7 && (rand() & 63) == 1) {
        SVECTOR origin = flame->end;
        origin.vy -= 80;
        Tm3SpawnSprite(2, &origin, 128, NULL, 12, -2);
    }
    if (flame->elapsed >= 15 / Tm3SpriteFrameCount(0)) {
        if (flame->frame != 2)
            --flame->frame;
        flame->elapsed = 0;
    }
    ++flame->elapsed;
    flame->size += 8;
    if (flame->age++ > 15)
        ObjectDestroy(flame);
}
static void flame_draw(Flame* flame, Tm4OrderingTag* ot, u8** cur, u8* limit, MATRIX* view)
{
    SVECTOR mid;
    ObjectCopyPosition(&mid, flame);
    Tm3DrawBillboard(0, flame->frame, flame->size, 0x404040, &mid, ot, cur, limit, view);
    Tm3DrawBillboard(0, flame->frame, flame->size, 0x404040, &flame->end, ot, cur, limit, view);
}
static s32 burn_init(Burn* burn, va_list args)
{
    memset(burn, 0, sizeof(*burn));
    SVECTOR position;
    void* owner = ObjectGetHeader(burn)->owner;
    if (owner) {
        ObjectCopyPosition(&position, owner);
        burn->width = burn->height = 120;
        burn->lifetime = 4;
    } else {
        position = *va_arg(args, const SVECTOR*);
        burn->width = va_arg(args, int);
        burn->height = burn->width * 3 / 2;
        burn->lifetime = va_arg(args, int);
        burn->smoke_mask = 1;
    }
    ObjectSetPosition(burn, position.vx, position.vy, position.vz);
    ObjectSetInteractionRadius(burn, burn->width / 2);
    Tm3PlayNamedSound("tm3_s10", NULL, burn, 1400, 0);
    return 1;
}
/* 800275fc advances the placement after spawning, so the second flame starts at the origin too. */
void Tm3GroundImpact(const SVECTOR* position, WebParticipantId source, s32 size, s32 count,
    s32 blast_size, s32 surface)
{
    SVECTOR p = *position;
    for (s32 i = 0; i < count; ++i) {
        ObjectCreateWithParticipant(ground_name, 0, source, &p, size, 8);
        p.vx = position->vx + Q12MulRound(rcos(i * 1024), i * 200);
        p.vz = position->vz - Q12MulRound(rsin(i * 1024), i * 200);
    }
    const SVECTOR rise = { 0, -700, 0, 0 };
    Tm3SpawnSurfaceSprite(0, position, blast_size, &rise, 12, -1, surface);
}
static void burn_tick(Burn* burn)
{
    SVECTOR position;
    Car* owner = ObjectGetHeader(burn)->owner;
    if (owner && owner->turbo_thrust_applied) {
        SVECTOR puff = { owner->transform.t[0], owner->transform.t[1], owner->transform.t[2], 0 };
        Tm3SpawnSprite(2, &puff, 200, NULL, 0, -2);
        ObjectDestroy(burn);
        return;
    }
    ObjectCopyPosition(&position, burn);
    if (!(burn->ticks & burn->smoke_mask))
        Tm3SpawnSmoke(&position.vx, burn->width);
    if (burn->elapsed >= 2) {
        burn->frame = (burn->frame + 1) % Tm3SpriteFrameCount(3);
        burn->elapsed = 0;
    }
    ++burn->elapsed;
    if (burn->ticks >= 30) {
        burn->ticks = 0;
        if (++burn->seconds >= burn->lifetime) {
            ObjectDestroy(burn);
            return;
        }
    }
    ++burn->ticks;
}
static void burn_draw(Burn* burn, Tm4OrderingTag* ot, u8** cur, u8* limit, MATRIX* view)
{
    SVECTOR position;
    ObjectCopyPosition(&position, burn);
    Tm3DrawFire(burn->frame, burn->width, burn->height, &position, ot, cur, limit, view);
}
void Tm3Ignite(Car* car, Burn* touching, WebParticipantId source)
{
    car->fire_ticks = 1;
    car->burn_source = source;
    if (touching && ObjectGetHeader(touching)->owner == car)
        return;
    for (Tm4ObjectHeader* h = ObjectGetHeader(car)->next; h; h = h->next) {
        if (h->owner == car && !strcmp(h->name, burn_name)) {
            Burn* existing = ObjectGetPayload(h);
            existing->ticks = existing->seconds = 0;
            h->participant = source;
            WEB_MODULE("car", CarAiInteractedWithFire)(car);
            return;
        }
    }
    ObjectCreateWithParticipant(burn_name, OBJECT_FOLLOW_OWNER, source, car);
}
static void burn_car(void* first, void* second)
{
    Tm3Ignite(first, second, ObjectGetHeader(second)->participant);
}
static void flame_car(void* first, void* second)
{
    Car* car = first;
    Tm4ObjectHeader* h = ObjectGetHeader(second);
    if (h->owner == car)
        return;
    Tm3Ignite(car, NULL, h->participant);
    WEB_MODULE("car", CarApplyParticipantDamage)
    (car, h->owner, h->participant, 4, NULL, "BURNED TO DEATH");
}
int Tm3FlamesRegister(RegistryDirectory* dir)
{
    return ObjectRegisterClass(emitter_name, sizeof(Emitter), dir,
               (Tm4PackedConstructor)emitter_init, NULL, (Tm4ObjectCallback)emitter_tick, NULL,
               NULL)
        && ObjectRegisterClass(flame_name, sizeof(Flame), dir, (Tm4PackedConstructor)flame_init,
            NULL, (Tm4ObjectCallback)flame_tick, (Tm4ObjectDisplayCallback)flame_draw, NULL)
        && ObjectRegisterClass(burn_name, sizeof(Burn), dir, (Tm4PackedConstructor)burn_init, NULL,
            (Tm4ObjectCallback)burn_tick, (Tm4ObjectDisplayCallback)burn_draw, NULL)
        && ObjectRegisterClass(ground_name, sizeof(Burn), dir, (Tm4PackedConstructor)burn_init,
            NULL, (Tm4ObjectCallback)burn_tick, (Tm4ObjectDisplayCallback)burn_draw, NULL)
        && ObjectRegisterInteractionCallback("car", ground_name, burn_car)
        && ObjectRegisterInteractionCallback("car", flame_name, flame_car)
        && ObjectRegisterInteractionCallback("car", burn_name, burn_car);
}
const SnapshotField emitter_fields[] = {
    SNAP_POD(Emitter, mount.vx),
    SNAP_POD(Emitter, mount.vy),
    SNAP_POD(Emitter, mount.vz),
    SNAP_POD(Emitter, age),
    { 0 },
};
const SnapshotField flame_fields[] = {
    SNAP_POD(Flame, end.vx),
    SNAP_POD(Flame, end.vy),
    SNAP_POD(Flame, end.vz),
    SNAP_POD(Flame, velocity.vx),
    SNAP_POD(Flame, velocity.vy),
    SNAP_POD(Flame, velocity.vz),
    SNAP_POD(Flame, age),
    SNAP_POD(Flame, size),
    SNAP_POD(Flame, frame),
    SNAP_POD(Flame, elapsed),
    { 0 },
};
const SnapshotField burn_fields[] = {
    { SnapshotPod, 0, sizeof(Burn), NULL },
    { 0 },
};
