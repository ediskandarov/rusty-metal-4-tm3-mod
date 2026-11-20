#include "laser.h"
#include "flame.h"
#include "mod_api.h"
#include "module_import.h"
#include "prop.h"
#include "tm3/resources.h"
#include "tm4/fixed.h"
#include "tm4/main/box.h"
#include "tm4/main/math3d.h"
#include "tm4/main/object.h"
#include "tm4/main/world.h"
#include <STDARG.H>
#include <string.h>

static char beam_class[] = "tm3MapBeam";
const SnapshotField Tm3MapBeamFields[] = {
    SNAP_POD(Tm3MapBeam, flight.previous),
    SNAP_POD(Tm3MapBeam, flight.position),
    SNAP_POD(Tm3MapBeam, flight.velocity),
    SNAP_POD(Tm3MapBeam, flight.midpoint),
    SNAP_POD(Tm3MapBeam, flight.age),
    SNAP_POD(Tm3MapBeam, origin.vx),
    SNAP_POD(Tm3MapBeam, origin.vy),
    SNAP_POD(Tm3MapBeam, origin.vz),
    SNAP_POD(Tm3MapBeam, pose.m),
    SNAP_POD(Tm3MapBeam, pose.t),
    { 0 },
};

static s32 construct(Tm3MapBeam* beam, va_list args)
{
    const SVECTOR* origin = va_arg(args, const SVECTOR*);
    const SVECTOR* direction = va_arg(args, const SVECTOR*);
    memset(beam, 0, sizeof(*beam));
    beam->origin = *origin;
    IdentifyMatrix(&beam->pose);
    Tm3ProjectileOrient(&beam->pose, &direction->vx);
    for (int i = 0; i < 3; ++i) {
        beam->pose.t[i] = beam->flight.position[i] = (&origin->vx)[i];
        beam->flight.previous[i] = beam->flight.position[i];
        beam->flight.velocity[i] = (beam->pose.m[i][2] * 30000) >> 12;
    }
    ObjectSetPosition(beam, origin->vx, origin->vy, origin->vz);
    Tm3PlayLaserSound(beam);
    Tm3FlashStart(0, 0);
    return 1;
}

/* Class 20 advances through ordinary surfaces, depositing a blast at each crossing. */
static void process(Tm3MapBeam* beam)
{
    Tm3ProjectileFlight* f = &beam->flight;
    Tm3ProjectileAdvance(f);
    SVECTOR from = { f->previous[0], f->previous[1], f->previous[2], 0 };
    SVECTOR to = { f->position[0], f->position[1], f->position[2], 0 };
    VECTOR delta = { to.vx - from.vx, to.vy - from.vy, to.vz - from.vz, 0 };
    ObjectSetPosition(beam, f->midpoint[0], f->midpoint[1], f->midpoint[2]);
    ObjectSetInteractionRadius(beam, VectorLength0(&delta) / 2);
    Tm4WorldHit hit = { 0 };
    if (IntersectWorldWithRay(&from, &to, 0, &hit) == 1) {
        if (!Tm3DamageScenery(hit.owner, 800, to.vx, to.vy, to.vz)
            && WorldTrackData[hit.surface.fields.material].kind == TM4_SURFACE_FALL_TO_DEATH) {
            ObjectDestroy(beam);
            return;
        }
        SVECTOR point = { Q12Round(hit.position.vx), Q12Round(hit.position.vy),
            Q12Round(hit.position.vz), 0 };
        Tm3GroundImpact(&point, ObjectGetHeader(beam)->participant, 128, 1, 768,
            WorldTrackData[hit.surface.fields.material].kind);
        Tm3ExplosionSettings burst = { .position = point,
            .material = Tm3RemoteMaterial,
            .color = 0x808080,
            .height = 80,
            .inner_ratio_q12 = 1365,
            .speed = 384,
            .duration = 20,
            .radial_force = 3072,
            .lift = 3072,
            .owner = ObjectGetHeader(beam)->owner,
            .source = ObjectGetHeader(beam)->participant,
            .affects_owner = 1,
            .once_per_car = 1 };
        Tm3SpawnExplosion(&burst);
    }
    if (f->age++ > 45)
        ObjectDestroy(beam);
}

static void hit_car(void* first, void* second)
{
    Car* car = first;
    Tm3MapBeam* beam = second;
    const Tm3ProjectileFlight* f = &beam->flight;
    SVECTOR from = { f->previous[0], f->previous[1], f->previous[2], 0 },
            to = { f->position[0], f->position[1], f->position[2], 0 }, contact;
    if (IntersectBoxWithSegment(&car->collision_box, &car->transform, &from, &to, &contact))
        WEB_MODULE("car", CarApplyParticipantDamage)
    (car, ObjectGetHeader(beam)->owner, ObjectGetHeader(beam)->participant, 800, NULL, NULL);
}

static void display(Tm3MapBeam* beam, Tm4OrderingTag* order, u8** cursor, u8* limit, MATRIX* view)
{
    Tm3DrawMapBeam(&beam->origin, beam->flight.position, &beam->pose, order, cursor, limit, view);
}

int Tm3LaserRegister(RegistryDirectory* directory)
{
    return ObjectFindClassIndex(beam_class) >= 0
        || (ObjectRegisterClass(beam_class, sizeof(Tm3MapBeam), directory,
                (Tm4PackedConstructor)construct, NULL, (Tm4ObjectCallback)process,
                (Tm4ObjectDisplayCallback)display, NULL)
            && ObjectRegisterInteractionCallback("car", beam_class, hit_car));
}

int Tm3LaunchMapBeam(Car* owner, const SVECTOR* origin, const SVECTOR* direction)
{
    return ObjectCreate(beam_class, OBJECT_HAS_OWNER, owner, origin, direction) != NULL;
}
