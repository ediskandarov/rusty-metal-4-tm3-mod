#include "remote.h"
#include "mod_api.h"
#include "module_import.h"
#include "tm3/resources.h"
#include "tm4/fixed.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/world.h"
#include "tm4/modules/destry.h"
#include <STDARG.H>
#include <string.h>

void CarTrackDetonationDevice(CarWeaponInstance*, Car*, void*);
static char remote_class[] = "tm3Remote";
const SnapshotField Tm3RemoteFields[] = {
    SNAP_POD(Tm3Remote, slot),
    { 0 },
};

static s32 construct(Tm3Remote* mine, va_list args)
{
    const SVECTOR* position = va_arg(args, const SVECTOR*);
    mine->slot = va_arg(args, s32);
    SVECTOR ground = *position;
    ground.vy = 16384;
    Tm4WorldHit collision = { 0 };
    if (IntersectWorldWithRay((SVECTOR*)position, &ground, 0, &collision) == 1)
        ground.vy = collision.position.vy >> 12;
    ObjectSetPosition(mine, ground.vx, ground.vy, ground.vz);
    ObjectSetInteractionRadius(mine, 28);
    Tm3PlayNamedSound("tm3_s13", NULL, mine, 870, 0);
    return 1;
}

static void display(Tm3Remote* mine, Tm4OrderingTag* ordering, u8** cursor, u8* end, MATRIX* view)
{
    MATRIX transform;
    RotationMatrixY(0, &transform);
    const Tm4ShortVectorXYZ* p = &ObjectGetHeader(mine)->position;
    transform.t[0] = p->vx;
    transform.t[1] = p->vy;
    transform.t[2] = p->vz;
    Tm3DisplayWeaponGroup(0x28, 0, -1, &transform, ordering, cursor, end, view);
}

/* 8002f488 casts eight fans of five rays against damageable world polygons. */
static void damage_scenery(SVECTOR* position)
{
    for (s32 azimuth = 0; azimuth < 4096; azimuth += 512) {
        for (s32 n = 0; n < 5; ++n) {
            s32 pitch = 1024 - (n + 1) * 409;
            s32 radial = Q12Round(2048 * rcos(pitch));
            SVECTOR end = { position->vx + Q12Round(radial * rcos(azimuth)),
                position->vy - Q12Round(radial * rsin(pitch)),
                position->vz + Q12Round(radial * rsin(azimuth)), 0 };
            Tm4WorldHit hit = { 0 };
            if (IntersectWorldWithRay(position, &end, 0, &hit) != 1 || !hit.owner
                || !ObjectValidObject(hit.owner)
                || strcmp(ObjectGetHeader(hit.owner)->name, "destroyable"))
                continue;
            WEB_MODULE("destry", DestroyableApplyDamage)
            (hit.owner, 500, end.vx, end.vy, end.vz);
        }
    }
}

static void explode(Tm3Remote* mine)
{
    Car* owner = ObjectGetHeader(mine)->owner;
    WEB_MODULE("car", RemoveObjectFromDetonationDeviceList)
    (mine);
    if (owner && GameIsCarRegistered(owner) && owner->control_kind == CAR_CONTROL_PLAYER
        && owner->weapons && mine->slot >= 0 && mine->slot < 20
        && owner->weapons[mine->slot].amount > 0)
        --owner->weapons[mine->slot].amount;
    SVECTOR p;
    ObjectCopyPosition(&p, mine);
    Tm3SpawnBurstParticles(&p);
    Tm3ExplosionSettings blast = { .position = p,
        .material = Tm3RemoteMaterial,
        .color = 0x808080,
        .height = 80,
        .inner_ratio_q12 = 1365,
        .speed = 384,
        .duration = 20,
        .radial_force = 2048,
        .lift = 1940,
        .owner = owner,
        .source = ObjectGetHeader(mine)->participant,
        .affects_owner = 1,
        .once_per_car = 1 };
    blast.position.vy -= 32;
    Tm3SpawnExplosion(&blast);
    damage_scenery(&p);
}

static void process(Tm3Remote* mine)
{
    Car* owner = ObjectGetHeader(mine)->owner;
    if (!owner || !GameIsCarRegistered(owner))
        ObjectDestroy(mine);
}

int Tm3RemoteRegister(RegistryDirectory* directory)
{
    return ObjectFindClassIndex(remote_class) >= 0
        || ObjectRegisterClass(remote_class, sizeof(Tm3Remote), directory,
            (Tm4PackedConstructor)construct, NULL, (Tm4ObjectCallback)process,
            (Tm4ObjectDisplayCallback)display, (Tm4ObjectCallback)explode);
}

s32 Tm3PlaceRemote(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
{
    SVECTOR local = car->collision_box.vertices[4], position;
    const SVECTOR* b = &car->collision_box.vertices[5];
    local.vx = (local.vx + b->vx) / 2;
    local.vy = (local.vy + b->vy) / 2;
    local.vz = (local.vz + b->vz) / 2;
    WEB_MODULE("car", CarLocalPosToWorldPos)
    (car, &local, &position);
    Tm3Remote* mine = ObjectCreate(
        remote_class, OBJECT_HAS_OWNER, car, &position, (s32)(weapon - car->weapons));
    if (mine) {
        weapon->next_time = 0; /* A second press can detonate immediately (80033e18). */
        WEB_MODULE("car", CarTrackDetonationDevice)
        (weapon, car, mine);
    }
    /* TM3 charges the round on detonation, including when the owner dies. */
    return 0;
}
