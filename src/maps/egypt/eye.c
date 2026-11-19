#include "eye.h"
#include "mod_api.h"
#include "module_import.h"
#include "tm4/main/game.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/world.h"
#include <STDARG.H>
#include <string.h>

static char eye_class[] = "tm3Eye";

/* The marker has only an owner and a position, both stored in the object header. */
static s32 construct(void* marker, va_list args)
{
    const SVECTOR* position = va_arg(args, const SVECTOR*);
    SVECTOR ground = *position;
    ground.vy = 16384;
    Tm4WorldHit hit = { 0 };
    if (IntersectWorldWithRay((SVECTOR*)position, &ground, 0, &hit) == 1)
        ground.vy = hit.position.vy >> 12;
    ObjectSetPosition(marker, ground.vx, ground.vy, ground.vz);
    ObjectSetInteractionRadius(marker, 28);
    WEB_MODULE("mtm3fx.sym", Tm3PlayNamedSound)("tm3_s13", NULL, marker, 870, 0);
    return 1;
}

static void process(void* marker)
{
    Car* owner = ObjectGetHeader(marker)->owner;
    if (!owner || !GameIsCarRegistered(owner))
        ObjectDestroy(marker);
}

static void display(void* marker, Tm4OrderingTag* order, u8** cursor, u8* end, MATRIX* view)
{
    MATRIX transform;
    RotationMatrixY(0, &transform);
    const Tm4ShortVectorXYZ* p = &ObjectGetHeader(marker)->position;
    transform.t[0] = p->vx;
    transform.t[1] = p->vy;
    transform.t[2] = p->vz;
    WEB_MODULE("mtm3fx.sym", Tm3DisplayWeaponGroup)
    (0x38, 0, -1, &transform, order, cursor, end, view);
}

int Tm3EyeRegister(void)
{
    return ObjectFindClassIndex(eye_class) >= 0
        || ObjectRegisterClass(
            eye_class, 0, RegGetDirectoryPtrS("/world"), construct, NULL, process, display, NULL);
}

/* 8003326c: the first press drops the marker; the second fires from map marker 2. */
s32 Tm3UseEye(Car* car, void* context, CarWeaponInstance* weapon, s32 rear)
{
    Tm4ObjectHeader* first = ObjectGetHeader(car);
    while (first->previous)
        first = first->previous;
    for (Tm4ObjectHeader* h = first; h; h = h->next) {
        if (h->owner != car || strcmp(h->name, eye_class))
            continue;
        const SVECTOR* origin = WEB_MODULE("mtm3fx.sym", Tm3WorldMarker)(2);
        if (!origin)
            return 0;
        int32_t delta[3] = { h->position.vx - origin->vx, h->position.vy - origin->vy,
            h->position.vz - origin->vz };
        SVECTOR direction = { 0 };
        WEB_MODULE("mtm3fx.sym", Tm3ProjectileNormalize)(delta, &direction.vx);
        if (!WEB_MODULE("mtm3fx.sym", Tm3LaunchMapBeam)(car, origin, &direction))
            return 0;
        ObjectDestroy(ObjectGetPayload(h));
        return 1;
    }
    SVECTOR local = car->collision_box.vertices[4], position;
    const SVECTOR* b = &car->collision_box.vertices[5];
    local.vx = (local.vx + b->vx) / 2;
    local.vy = (local.vy + b->vy) / 2;
    local.vz = (local.vz + b->vz) / 2;
    WEB_MODULE("car", CarLocalPosToWorldPos)(car, &local, &position);
    if (ObjectCreate(eye_class, OBJECT_HAS_OWNER, car, &position))
        weapon->next_time = 0;
    return 0;
}

static const SnapshotField fields[] = {
    { 0 },
};

const SnapshotType Tm3EyeSnapshots[] = {
    { .name = "tm3Eye", .size = 0, .fields = fields, .hash_fields = 1 },
    { 0 },
};
