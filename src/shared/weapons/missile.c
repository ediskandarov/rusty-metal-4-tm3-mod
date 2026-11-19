#include "tm3/missile.h"
#include "flame.h"
#include "mod_api.h"
#include "module_import.h"
#include "prop.h"
#include "tm3/resources.h"
#include "tm4/fixed.h"
#include "tm4/main/box.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/system.h"
#include "tm4/main/world.h"
#include "tm4/modules/car_effect.h"
#include "tm4/modules/car_weapon.h"
#include "tm4/modules/destry.h"
#include <STDARG.H>
#include <stdio.h>
#include <string.h>
typedef struct {
    MATRIX transform;
    SVECTOR velocity;
    Car* target;
    u32 profile, color, volley_slot;
    u16 speed;
} MissileSpawn;
static char missile_class[] = "tm3Missile";
static s32 signed_word(u32 value)
{
    return value <= INT32_MAX ? (s32)value : -1 - (s32)(UINT32_MAX - value);
}
static u32 distance_squared(const int16_t a[3], const int16_t b[3])
{
    s32 x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
    return (u32)((int64_t)x * x + (int64_t)y * y + (int64_t)z * z);
}
static void add_force(Car* car, const s32 force[3])
{
    for (CarParticle* p = car->particles; p < car->particle_end; ++p) {
        p->external_force.vx += force[0];
        p->external_force.vy += force[1];
        p->external_force.vz += force[2];
    }
}
static Car* registered(Car* car, s32 serial)
{
    return car && GameIsCarRegistered(car) && ObjectGetHeader(car)->serial == serial ? car : NULL;
}
static s32 random_draw(void* ignored)
{
    return rand();
}
static s32 missile_constructor(Tm3Missile* missile, va_list arguments)
{
    const MissileSpawn* spawn = va_arg(arguments, const MissileSpawn*);
    const Tm3ProjectilePresentation* art = Tm3ProjectileArtwork(spawn->profile);
    if (!art)
        return 0;
    memset(missile, 0, sizeof(*missile));
    missile->transform = spawn->transform;
    missile->flight.speed = spawn->speed;
    missile->profile = spawn->profile;
    missile->volley_slot = spawn->volley_slot;
    missile->damage = Tm3ProjectileDefaults(spawn->profile)->damage;
    for (s32 axis = 0; axis < 3; ++axis) {
        missile->flight.position[axis] = missile->flight.previous[axis] = spawn->transform.t[axis];
        missile->flight.midpoint[axis] = spawn->transform.t[axis];
        missile->flight.velocity[axis] = (&spawn->velocity.vx)[axis];
    }
    missile->target = spawn->target;
    missile->target_serial = spawn->target ? ObjectGetHeader(spawn->target)->serial : 0;
    Tm3ProjectileLaunchFrame(&missile->transform);
    Tm3MissileTrailInit(&missile->trail, missile->flight.position, spawn->color, art->effect_size,
        spawn->profile == 6 ? 4 : 8);
    ObjectSetPosition(missile, spawn->transform.t[0], spawn->transform.t[1], spawn->transform.t[2]);
    ObjectSetInteractionRadius(missile, 0);
    if (art->flight_sound >= 0) {
        char sound[24];
        snprintf(sound, sizeof(sound), "tm3_s%02d", art->flight_sound);
        Tm3PlayNamedSound(sound, NULL, missile, art->flight_pitch, 0);
    }
    return 1;
}

static char rain_drop_class[] = "tm3RainDrop";
const SnapshotField Tm3RainDropFields[] = { SNAP_POD(Tm3RainDrop, flight.previous),
    SNAP_POD(Tm3RainDrop, flight.position), SNAP_POD(Tm3RainDrop, flight.velocity),
    SNAP_POD(Tm3RainDrop, flight.midpoint), SNAP_POD(Tm3RainDrop, flight.age),
    SNAP_POD(Tm3RainDrop, transform.m), SNAP_POD(Tm3RainDrop, transform.t), { 0 } };
static s32 drop_constructor(Tm3RainDrop* drop, va_list args)
{
    const Tm3Missile* parent = va_arg(args, const Tm3Missile*);
    const SVECTOR* velocity = va_arg(args, const SVECTOR*);
    memset(drop, 0, sizeof(*drop));
    drop->transform = parent->transform;
    memcpy(drop->flight.position, parent->flight.position, sizeof(drop->flight.position));
    memcpy(drop->flight.velocity, &velocity->vx, sizeof(drop->flight.velocity));
    ObjectSetPosition(
        drop, drop->flight.position[0], drop->flight.position[1], drop->flight.position[2]);
    ObjectSetInteractionRadius(drop, 100);
    return 1;
}

static void drop_process(Tm3RainDrop* drop)
{
    Tm3ProjectileFlight* f = &drop->flight;
    Tm3ProjectileAdvance(f);
    SVECTOR start = { f->previous[0], f->previous[1], f->previous[2], 0 };
    SVECTOR end = { f->position[0], f->position[1], f->position[2], 0 };
    Tm4WorldHit hit = { 0 };
    ObjectSetPosition(drop, f->midpoint[0], f->midpoint[1], f->midpoint[2]);
    ObjectSetInteractionRadius(drop, SquareRoot0(distance_squared(f->previous, f->position)) / 2);
    f->velocity[1] += 222;
    if (IntersectWorldWithRay(&start, &end, 0, &hit) == 1) {
        if (hit.owner && ObjectValidObject(hit.owner)
            && !strcmp(ObjectGetHeader(hit.owner)->name, "destroyable"))
            WEB_MODULE("destry", DestroyableApplyDamage)
        (hit.owner, 800, end.vx, end.vy, end.vz);
        Tm3GroundImpact(&end, ObjectGetHeader(drop)->participant, 128, 1, 800,
            WorldTrackData[hit.surface.fields.material].kind);
        ObjectDestroy(drop);
        return;
    }
    if (ObjectOffGrid(drop)) {
        ObjectDestroy(drop);
        return;
    }
    ++f->age;
    for (int axis = 0; axis < 3; ++axis)
        drop->transform.t[axis] = f->position[axis];
    Tm3ProjectileOrient(&drop->transform, f->velocity);
}

static void drop_display(
    Tm3RainDrop* drop, Tm4OrderingTag* order, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DisplayEnergyMissile(
        &drop->transform, Tm3RainDropVisual, drop->flight.age, order, cursor, limit, view);
}

static void rain_split(Tm3Missile* parent)
{
    WEB_MODULE("car", RemoveObjectFromDetonationDeviceList)
    (parent);
    Car* owner = ObjectGetHeader(parent)->owner;
    if (owner && GameIsCarRegistered(owner) && owner->weapons
        && owner->control_kind == CAR_CONTROL_PLAYER && owner->weapons[7].amount > 0)
        --owner->weapons[7].amount;
    s32 dot = 0;
    for (int axis = 0; axis < 3; ++axis)
        dot += parent->flight.velocity[axis] * parent->transform.m[axis][2];
    s32 speed = Q12Round(dot) / 8;
    s32 drift[3];
    for (int axis = 0; axis < 3; ++axis)
        drift[axis] = (s32)((int64_t)parent->transform.m[axis][2] * (s16)speed >> 12);
    for (int i = 1; i <= 6; ++i) {
        int angle = 682 * i;
        SVECTOR velocity = { drift[0] + Q12Round(768 * rcos(angle)), drift[1] - 1536,
            drift[2] + Q12Round(768 * rsin(angle)), 0 };
        ObjectCreateWithParticipant(
            rain_drop_class, 0, ObjectGetHeader(parent)->participant, parent, &velocity);
    }
}

static void missile_destroy(Tm3Missile* missile)
{
    Car* owner = ObjectGetHeader(missile)->owner;
    if (missile->profile == 7)
        rain_split(missile);
    if (missile->volley_slot && owner && GameIsCarRegistered(owner)) {
        Tm3MissileOwner* car = owner->callback_context;
        u32 slot = missile->volley_slot - 1;
        if (car && slot < 4 && car->projectiles[slot] == missile)
            car->projectiles[slot] = NULL;
    }
}
static int missile_impact(Tm3Missile* missile, Car* hit)
{
    const Tm3ProjectileTuning* tuning = Tm3ProjectileDefaults(missile->profile);
    SVECTOR position = { missile->flight.position[0], missile->flight.position[1],
        missile->flight.position[2], 0 };
    if (hit) {
        Car* owner = ObjectGetHeader(missile)->owner;
        s32 survived = WEB_MODULE("car", CarApplyParticipantDamage)(
            hit, owner, ObjectGetHeader(missile)->participant, missile->damage, NULL, NULL);
        if (survived && missile->profile == 4)
            Tm3Ignite(hit, NULL, ObjectGetHeader(missile)->participant);
        else if (survived && missile->profile == 3 && !hit->shield_ticks) {
            WEB_MODULE("car", CarFreezeCar)
            (hit);
            hit->freeze_ticks = Tm3FreezeTicks;
        } else if (survived && missile->profile != 3 && missile->profile != 17
            && missile->profile != 8) {
            int16_t forward[3] = { missile->transform.m[0][2], missile->transform.m[1][2],
                missile->transform.m[2][2] };
            int32_t force[3];
            Tm3ProjectileImpactForce(tuning, forward, force);
            add_force(hit, force);
        }
    }
    if (missile->profile == 8 || (missile->profile == 4 && !hit)) {
        /* 8003132c (Mortar) and 80030df4 (Napalm) choose distinct splash profiles. */
        const int mortar = missile->profile == 8;
        Tm3ExplosionSettings splash = { .position = position,
            .material = Tm3Untextured,
            .color = 0x202020,
            .height = 32,
            .inner_ratio_q12 = 1024,
            .speed = mortar ? 128 : 384,
            .duration = mortar ? 30 : 15,
            .radial_force = mortar ? 764 : 1024,
            .lift = mortar ? 640 : 700,
            .owner = ObjectGetHeader(missile)->owner,
            .source = ObjectGetHeader(missile)->participant,
            .affects_owner = 1,
            .once_per_car = 1 };
        if (mortar) {
            position.vy -= 200;
            Tm3SpawnSprite(0, &position, 800, NULL, 12, -1);
        } else {
            splash.position.vy -= 96;
            const SVECTOR still = { 0 };
            Tm3GroundImpact(&position, ObjectGetHeader(missile)->participant, 160, 3, 768,
                missile->surface_kind);
            Tm3SpawnSurfaceSprite(1, &position, 768, &still, 12, -1, missile->surface_kind);
        }
        Tm3SpawnExplosion(&splash);
    } else if (missile->profile == 17) {
        /* 80032104 uses two sprites at the contact and a lower class-9 origin. */
        Tm3SpawnSprite(0, &position, 1024, NULL, 12, -1);
        Tm3SpawnSprite(1, &position, 1024, NULL, 12, -1);
        position.vy -= 32;
        Tm3ExplosionSettings burst = { .position = position,
            .color = 0x30,
            .height = 80,
            .inner_ratio_q12 = 1024,
            .speed = 384,
            .duration = 10,
            .radial_force = 760,
            .lift = 700,
            .owner = ObjectGetHeader(missile)->owner,
            .source = ObjectGetHeader(missile)->participant,
            .affects_owner = 1,
            .once_per_car = 1 };
        Tm3SpawnExplosion(&burst);
    } else {
        Tm3SpawnSprite(0, &position, tuning->impact_size, NULL, 12, -1);
    }
    if (tuning->effect != 1)
        return 0;
    missile->linger = 30;
    missile->hit = NULL;
    ObjectSetInteractionRadius(missile, 0);
    return 1;
}
static int ricochet_step(Tm3Missile* missile)
{
    Tm3ProjectileFlight* f = &missile->flight;
    Tm3ProjectileAdvance(f);
    s32 speed = SquareRoot0(distance_squared(f->velocity, (const int16_t[3]) { 0 }));
    if (speed < 1024)
        speed = 1024;
    if (speed > f->speed)
        speed = f->speed;
    SVECTOR from = { f->previous[0], f->previous[1], f->previous[2], 0 };
    SVECTOR end = { f->position[0], f->position[1], f->position[2], 0 };
    SVECTOR normal;
    s32 contacts = 0;
    Tm4WorldHit hit = { 0 };
    while (IntersectWorldWithRay(&from, &end, 2, &hit) == 1) {
        end.vx = f->position[0] = Q12Round(hit.position.vx);
        end.vy = f->position[1] = Q12Round(hit.position.vy);
        end.vz = f->position[2] = Q12Round(hit.position.vz);
        if (++contacts >= 4
            || WorldTrackData[hit.surface.fields.material].kind == TM4_SURFACE_FALL_TO_DEATH)
            return missile_impact(missile, NULL);
        normal = hit.surface.vector;
    }
    if (contacts)
        Tm3RicochetReflect(f, &normal.vx, speed);
    f->velocity[1] += 512;
    for (s32 axis = 0; axis < 3; ++axis) {
        f->midpoint[axis] = (f->previous[axis] + f->position[axis]) / 2;
        missile->transform.t[axis] = f->midpoint[axis];
    }
    missile->transform.t[1] -= 64;
    RotMatrixX((((speed - 1024) / 1024) * 64) | 32, &missile->transform);
    ObjectSetPosition(
        missile, missile->transform.t[0], missile->transform.t[1], missile->transform.t[2]);
    ObjectSetInteractionRadius(missile, Tm3ProjectileDefaults(5)->interaction_radius);
    ++f->age;
    if (ObjectOffGrid(missile))
        return missile_impact(missile, NULL);
    return 1;
}
static int missile_step(Tm3Missile* missile)
{
    if (missile->linger) {
        Tm3MissileTrailStep(&missile->trail, &missile->transform, missile->flight.age);
        ++missile->flight.age;
        if (missile->profile == 14)
            missile->damage = Tm3WarthogDamage(missile->flight.age);
        return --missile->linger != 0;
    }
    Car* hit = registered(missile->hit, missile->hit_serial);
    if (missile->world_hit && hit) {
        u32 world_distance = distance_squared(missile->flight.position, missile->flight.previous);
        if (signed_word(missile->hit_distance) < signed_word(world_distance))
            missile->world_hit = 0;
        else
            hit = NULL;
    }
    if (missile->world_hit) {
        void* owner = missile->world_owner;
        if (owner && ObjectValidObject(owner)
            && ObjectGetHeader(owner)->serial == missile->world_serial
            && !strcmp(ObjectGetHeader(owner)->name, "destroyable"))
            WEB_MODULE("destry", DestroyableApplyDamage)
        (owner, missile->damage, missile->flight.position[0], missile->flight.position[1],
            missile->flight.position[2]);
        return missile_impact(missile, NULL);
    }
    if (hit) {
        for (s32 axis = 0; axis < 3; ++axis)
            missile->transform.t[axis] = missile->flight.position[axis]
                = (&missile->contact.vx)[axis];
        return missile_impact(missile, hit);
    }
    missile->hit = NULL;
    if (missile->profile == 5)
        return ricochet_step(missile);
    const Tm3ProjectileTuning* tuning = Tm3ProjectileDefaults(missile->profile);
    Tm3ProjectileAdvance(&missile->flight);
    if (missile->profile != 15) {
        SVECTOR start = { missile->flight.previous[0], missile->flight.previous[1],
            missile->flight.previous[2], 0 };
        SVECTOR end = { missile->flight.position[0], missile->flight.position[1],
            missile->flight.position[2], 0 };
        Tm4WorldHit collision = { 0 };
        if (IntersectWorldWithRay(&start, &end, 0, &collision) == 1) {
            missile->world_hit = 1;
            missile->surface_kind = WorldTrackData[collision.surface.fields.material].kind;
            missile->world_owner = collision.owner;
            missile->world_serial = collision.owner ? ObjectGetHeader(collision.owner)->serial : 0;
            for (s32 axis = 0; axis < 3; ++axis) {
                missile->flight.position[axis] = Q12Round((&collision.position.vx)[axis]);
                missile->flight.midpoint[axis]
                    = (missile->flight.previous[axis] + missile->flight.position[axis]) / 2;
            }
        }
    }
    for (s32 axis = 0; axis < 3; ++axis)
        missile->transform.t[axis] = missile->flight.position[axis];
    Car* target = registered(missile->target, missile->target_serial);
    if (!target)
        missile->target = NULL;
    SVECTOR target_position;
    if (target)
        ObjectCopyPosition(&target_position, target);
    if (missile->profile == 4 || missile->profile == 8 || missile->profile == 17) {
        Tm3RoadkillGuide(&missile->transform, missile->flight.speed, tuning->steering,
            target ? &target_position.vx : NULL, missile->flight.velocity);
    } else if (missile->profile == 7) {
        int32_t velocity[3],
            horizontal[3] = { missile->transform.m[0][2], 0, missile->transform.m[2][2] };
        int16_t current[3], heading[3];
        for (int i = 0; i < 3; ++i)
            velocity[i] = missile->flight.velocity[i];
        Tm3ProjectileNormalize(horizontal, heading);
        Tm3ProjectileNormalize(velocity, current);
        for (int i = 0; i < 3; ++i)
            velocity[i] = current[i] + ((heading[i] * 768) >> 12);
        Tm3ProjectileNormalize(velocity, current);
        for (int i = 0; i < 3; ++i)
            missile->flight.velocity[i] = (current[i] * missile->flight.speed) >> 12;
        Tm3ProjectileOrient(&missile->transform, missile->flight.velocity);
    } else {
        Tm3ProjectileGuide(
            &missile->flight, tuning, target ? &target_position.vx : NULL, random_draw, NULL);
        Tm3ProjectileOrient(&missile->transform, missile->flight.velocity);
    }
    if (tuning->effect == 1) {
        Tm3MissileTrailStep(&missile->trail, &missile->transform, missile->flight.age);
    } else if (tuning->effect == 2) {
        SVECTOR position = { missile->flight.position[0], missile->flight.position[1],
            missile->flight.position[2], 0 };
        SVECTOR velocity = { 0 };
        Tm3ProjectileSmokeVelocity(missile->flight.velocity, &velocity.vx);
        Tm3SpawnSprite(
            2, &position, Tm3ProjectileArtwork(missile->profile)->effect_size, &velocity, 12, -2);
    }
    s32 dx = missile->flight.position[0] - missile->flight.previous[0];
    s32 dy = missile->flight.position[1] - missile->flight.previous[1];
    s32 dz = missile->flight.position[2] - missile->flight.previous[2];
    u32 square = (u32)((int64_t)dx * dx + (int64_t)dy * dy + (int64_t)dz * dz);
    ObjectSetPosition(missile, missile->flight.midpoint[0], missile->flight.midpoint[1],
        missile->flight.midpoint[2]);
    ObjectSetInteractionRadius(missile, SquareRoot0(square) / 2);
    /* Spectre (800322e8) ignores walls; Warthog retains the pending world hit. */
    if (++missile->flight.age > Tm3WeaponTimeTicks(tuning->lifetime_q12)
        && !missile_impact(missile, NULL))
        return 0;
    if (missile->profile == 14)
        missile->damage = Tm3WarthogDamage(missile->flight.age);
    return 1;
}
static void missile_process(Tm3Missile* missile)
{
    int live = missile_step(missile);
    if (missile->profile == 4 || missile->profile == 8 || missile->profile == 17)
        Tm3SpawnRoadkillTrail(missile->flight.position);
    if (!live)
        ObjectDestroy(missile);
}
static void missile_car(void* first, void* second)
{
    Car* car = first;
    Tm3Missile* missile = second;
    if (missile->linger || car == ObjectGetHeader(missile)->owner)
        return;
    SVECTOR start = { missile->flight.previous[0], missile->flight.previous[1],
        missile->flight.previous[2], 0 };
    SVECTOR end = { missile->flight.position[0], missile->flight.position[1],
        missile->flight.position[2], 0 },
            contact;
    if (!IntersectBoxWithSegment(&car->collision_box, &car->transform, &start, &end, &contact))
        return;
    s32 dx = contact.vx - start.vx, dy = contact.vy - start.vy, dz = contact.vz - start.vz;
    u32 distance = (u32)((int64_t)dx * dx + (int64_t)dy * dy + (int64_t)dz * dz);
    if (missile->hit && signed_word(distance) >= signed_word(missile->hit_distance))
        return;
    missile->hit = car;
    missile->hit_serial = ObjectGetHeader(car)->serial;
    missile->contact = contact;
    missile->hit_distance = distance;
}
static void missile_display(
    Tm3Missile* missile, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    const Tm3ProjectilePresentation* art = Tm3ProjectileArtwork(missile->profile);
    if (art->draw_ribbon)
        Tm3DisplayMissileTrail(&missile->trail, ordering, cursor, limit, view);
    if (!missile->linger) {
        MATRIX transform;
        if (missile->profile == 3 || missile->profile == 4) {
            Tm3DisplayEnergyMissile(&missile->transform,
                missile->profile == 4 ? Tm3NapalmVisual : Tm3FreezeVisual, missile->flight.age,
                ordering, cursor, limit, view);
            return;
        }
        Tm3ProjectileModelPose(&missile->transform, missile->flight.age, art->spin, &transform);
        Tm3DisplayWeaponGroup(art->descriptor, 0, &transform, ordering, cursor, limit, view);
    }
}
int Tm3MissilesRegister(RegistryDirectory* directory)
{
    if (ObjectFindClassIndex(rain_drop_class) < 0
        && !ObjectRegisterClass(rain_drop_class, sizeof(Tm3RainDrop), directory,
            (Tm4PackedConstructor)drop_constructor, NULL, (Tm4ObjectCallback)drop_process,
            (Tm4ObjectDisplayCallback)drop_display, NULL))
        return 0;
    return ObjectFindClassIndex(missile_class) >= 0
        || (ObjectRegisterClass(missile_class, sizeof(Tm3Missile), directory,
                (Tm4PackedConstructor)missile_constructor, NULL, (Tm4ObjectCallback)missile_process,
                (Tm4ObjectDisplayCallback)missile_display, (Tm4ObjectCallback)missile_destroy)
            && ObjectRegisterInteractionCallback("car", missile_class, missile_car)
            && (ObjectFindClassIndex("tm3Prop") < 0
                || ObjectRegisterInteractionCallback(
                    missile_class, "tm3Prop", Tm3MissileHitsProp)));
}
Tm3Missile* Tm3MissileLaunch(Tm3MissileOwner* state, Car* owner, Car* target,
    const MATRIX* transform, s32 rear, u32 profile, u32 slot, u32 color)
{
    if (slot >= 4 || !Tm3ProjectileArtwork(profile))
        return NULL;
    MissileSpawn spawn = { .transform = *transform,
        .target = target,
        .profile = profile,
        .color = color,
        .volley_slot = state ? slot + 1 : 0 };

    const CarParticle* body = owner->particle_end - 1;
    int32_t body_velocity[3]
        = { body->velocity_q12.vx, body->velocity_q12.vy, body->velocity_q12.vz };
    const Tm3ProjectileTuning* tuning = Tm3ProjectileDefaults(profile);
    Tm3ProjectileOffsetLaunch(transform, tuning->launch_offset, &spawn.transform);
    int16_t forward[3]
        = { spawn.transform.m[0][2], spawn.transform.m[1][2], spawn.transform.m[2][2] };
    spawn.speed
        = Tm3ProjectileLaunchVelocity(tuning, forward, body_velocity, rear, &spawn.velocity.vx);
    Tm3Missile* missile = ObjectCreate(missile_class, 1, owner, &spawn);
    if (!missile)
        return NULL;
    if (state)
        state->projectiles[slot] = missile;
    if (!rear) {
        s32 recoil[3] = { -forward[0] * tuning->recoil, -forward[1] * tuning->recoil,
            -forward[2] * tuning->recoil };
        add_force(owner, recoil);
    }
    return missile;
}
const SnapshotField Tm3MissileFields[] = { SNAP_POD(Tm3Missile, flight.previous),
    SNAP_POD(Tm3Missile, flight.position), SNAP_POD(Tm3Missile, flight.velocity),
    SNAP_POD(Tm3Missile, flight.midpoint), SNAP_POD(Tm3Missile, flight.age),
    SNAP_POD(Tm3Missile, flight.speed), SNAP_POD(Tm3Missile, transform.m),
    SNAP_POD(Tm3Missile, transform.t), SNAP_POD(Tm3Missile, trail),
    SNAP_WEAK_REF(Tm3Missile, target, "car"), SNAP_WEAK_REF(Tm3Missile, hit, "car"),
    SNAP_POD(Tm3Missile, target_serial), SNAP_POD(Tm3Missile, hit_serial),
    SNAP_POD(Tm3Missile, contact.vx), SNAP_POD(Tm3Missile, contact.vy),
    SNAP_POD(Tm3Missile, contact.vz), SNAP_POD(Tm3Missile, hit_distance),
    SNAP_POD(Tm3Missile, linger), SNAP_POD(Tm3Missile, profile), SNAP_POD(Tm3Missile, damage),
    SNAP_POD(Tm3Missile, volley_slot), SNAP_POD(Tm3Missile, surface_kind),
    SNAP_POD(Tm3Missile, world_hit), SNAP_WEAK_REF(Tm3Missile, world_owner, NULL),
    SNAP_POD(Tm3Missile, world_serial), { 0 } };
