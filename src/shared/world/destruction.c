#include "destruction.h"
#include "module_import.h"
#include "snapshot_types.h"
#include "stage.h"
#include "tm3/resources.h"
#include "tm4/fixed.h"
#include "tm4/integer.h"
#include "tm4/main/object.h"
#include "tm4/main/world.h"
#include "tm4/modules/car_weapon.h"
#include "tm4/modules/destry.h"
#include "tm4/modules/expl.h"
#include "tm4/modules/ray.h"
#include "tm4/modules/weap.h"
#include <string.h>

u32 Tm3DestroyableSizeof = sizeof(Tm3Destroyable);
const SnapshotField Tm3DestroyableFields[] = {
    SNAP_LOCAL(Tm3Destroyable, registry),
    SNAP_POD(Tm3Destroyable, hit_points),
    SNAP_POD(Tm3Destroyable, stage),
    SNAP_LIST(Tm3Destroyable, interactions, &WebSnapshotInteractionHistory),
    { 0 },
};

static RegistryDirectory* stage_directory(const Tm3Destroyable* object)
{
    RegistryDirectory* stage = object->registry;
    for (u32 i = 0; stage && i < object->stage; ++i)
        stage = RegGetDirectoryPtrPS(stage, "next");
    return stage;
}

int Tm3DestroyableValidate(const void* payload)
{
    const Tm3Destroyable* object = payload;
    RegistryDirectory* stage = stage_directory(object);
    const s32* health = stage ? RegGetFileDataPS(stage, "hitPoints") : NULL;
    return health && object->hit_points > 0 && object->hit_points <= *health;
}

static void set_passive(RegistryDirectory* stage, s32 enabled)
{
    RegistryDirectory* passive = RegGetDirectoryPtrPS(stage, "passive");
    Tm4WorldInfoBundle* world = passive ? WorldObjectGetInfo(passive) : NULL;
    if (world)
        WorldObjectSet(world, enabled);
}

s32 Tm3DestroyableInstanceConstructor(Tm3Destroyable* object, RegistryDirectory* registry)
{
    const s32* health = RegGetFileDataPS(registry, "hitPoints");
    Tm4WorldInfoBundle* world = WorldObjectGetInfo(registry);
    if (!health || *health <= 0 || !world || !WorldObjectCollisionPolysSetOwner(world, object))
        return 0;
    object->registry = registry;
    object->hit_points = *health;
    object->stage = 0;
    ObjectInteractionListConstructor(&object->interactions);
    return 1;
}

#ifdef TM3_TEST_HOOKS
static void test_apply_damage(Tm3Destroyable* object);
#endif

void Tm3DestroyableProcess(Tm3Destroyable* object)
{
    ObjectInteractionListProcess(&object->interactions);
#ifdef TM3_TEST_HOOKS
    test_apply_damage(object);
#endif
}

void Tm3DestroyableDestructor(Tm3Destroyable* object)
{
    ObjectInteractionListDestructor(&object->interactions);
}

static void release_instances(RegistryDirectory* registry)
{
    RegistryDirectory* events = RegGetDirectoryPtrPS(registry, "onDestroy");
    RegistryDirectory* saved = RegGetCurrentDirectoryPtr();
    for (s32 i = 0; events && i < RegGetNumberOfDirectoriesP(events); ++i) {
        RegistryDirectory* event = RegGetDirectoryPtrPN(events, i);
        char* name = RegGetFileDataPS(event, "class");
        char* instance = RegGetFileDataPS(event, "instance");
        if (name && instance)
            ObjectCreate(name, OBJECT_FROM_INSTANCE, instance);
    }
    RegChangeCurrentDirectoryP(saved);
}

static void damage(Tm3Destroyable* object, s32 amount, s32 x, s32 y, s32 z)
{
    if (amount < object->hit_points) {
        object->hit_points -= amount;
        return;
    }
    RegistryDirectory* stage = stage_directory(object);
    Tm4WorldInfoBundle* world = WorldObjectGetInfo(stage);
    WorldObjectCollisionPolysSetOwner(world, NULL);
    WorldObjectSet(world, 0);
    set_passive(stage, 0);
    const s32* ai = RegGetFileDataPS(object->registry, "aiObject");
    if (ai)
        WEB_MODULE("car", ChangeAIObjectNumState)(*ai, object->stage + 1);
    Tm3StageEffect(stage, x, y, z);
    RegistryDirectory* next = RegGetDirectoryPtrPS(stage, "next");
    if (next) {
        Tm4WorldInfoBundle* replacement = WorldObjectGetInfo(next);
        const s32* health = RegGetFileDataPS(next, "hitPoints");
        if (replacement) {
            WorldObjectSet(replacement, 1);
            set_passive(next, 1);
            if (health && *health > 0 && WorldObjectCollisionPolysSetOwner(replacement, object)) {
                ++object->stage;
                object->hit_points = *health;
                return;
            }
        }
    }
    release_instances(object->registry);
    ObjectDestroy(object);
}

/* TM3 weapons also run on stock maps. Each owner keeps its own damage implementation. */
s32 Tm3DamageScenery(void* owner, s32 amount, s32 x, s32 y, s32 z)
{
    if (!owner || !ObjectValidObject(owner))
        return 0;
    const char* name = ObjectGetHeader(owner)->name;
    if (!strcmp(name, "tm3Destroyable"))
        damage(owner, amount, x, y, z);
    else if (!strcmp(name, "destroyable"))
        WEB_MODULE("destry", DestroyableApplyDamage)(owner, amount, x, y, z);
    else
        return 0;
    return 1;
}

void InteractBulletWithTm3Destroyable(void* first, void* second)
{
    Bullet* b = first;
    damage(second, b->impact.fields.damage, b->collision.position.vx, b->collision.position.vy,
        b->collision.position.vz);
}
void InteractWeaponProjectileWithTm3Destroyable(void* first, void* second)
{
    WeaponProjectile* p = first;
    damage(second, p->damage, p->bullet.collision.position.vx, p->bullet.collision.position.vy,
        p->bullet.collision.position.vz);
}
void InteractCarWithTm3Destroyable(void* first, void* second)
{
    Car* car = first;
    Tm3Destroyable* object = second;
    if (ObjectInteractionListInteractWithObjectFirstTime(&object->interactions, car))
        damage(object, 1, car->transform.t[0], car->transform.t[1], car->transform.t[2]);
}
void InteractExplosionShockWaveWithTm3Destroyable(void* first, void* second)
{
    ExplosionWave* wave = first;
    ExplosionDefinition* info = wave->definition;
    s32 fraction = Q12Div(Int32Max(wave->inner_radial_speed, wave->outer_radial_speed),
        Int32Max(info->initial_inner_speed, info->initial_outer_speed));
    Tm4WorldHit* hit = wave->ray_result;
    damage(second, Q12MulRound((s16)wave->damage, fraction), hit->position.vx, hit->position.vy,
        hit->position.vz);
}
void InteractWeaponRayBeamWithTm3Destroyable(void* first, void* second)
{
    RayBeam* beam = first;
    damage(second, beam->damage, beam->hit_world.vx, beam->hit_world.vy, beam->hit_world.vz);
}

#ifdef TM3_TEST_HOOKS
static s32 pending_event = -1;
s32 Tm3TestHitSceneryWithEvent(s32 animation)
{
    pending_event = !!animation;
    return 1;
}

/* Execute inside the simulation's object arena, just like a real collision. */
static void test_apply_damage(Tm3Destroyable* object)
{
    if (pending_event < 0)
        return;
    RegistryDirectory* events = RegGetDirectoryPtrPS(object->registry, "onDestroy");
    for (s32 i = 0; events && i < RegGetNumberOfDirectoriesP(events); ++i) {
        char* name = RegGetFileDataPS(RegGetDirectoryPtrPN(events, i), "class");
        if (name && !strcmp(name, pending_event ? "tm3Transition" : "powerup")) {
            pending_event = -1;
            SVECTOR position;
            ObjectCopyPosition(&position, object);
            struct {
                Tm4ObjectHeader header;
                Bullet bullet;
            } shot = { 0 };
            shot.header.class_index = ObjectFindClassIndex("bullet");
            shot.bullet.impact.fields.damage = object->hit_points;
            shot.bullet.collision.position.vx = position.vx;
            shot.bullet.collision.position.vy = position.vy;
            shot.bullet.collision.position.vz = position.vz;
            ObjectInteractObjectHeaderWithObjectHeader(&shot.header, ObjectGetHeader(object));
            return;
        }
    }
}
#endif
