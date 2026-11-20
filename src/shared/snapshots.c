#include "decoration.h"
#include "effects/private.h"
#include "flame.h"
#include "flash.h"
#include "laser.h"
#include "private.h"
#include "prop.h"
#include "remote.h"
#include "surface.h"
#include "tm3/lightning.h"
#include "tm3/missile.h"

static const SnapshotType snapshot_types[] = {
    { .name = "tm3ScreenFlash",
        .size = sizeof(Tm3ScreenFlash),
        .fields = Tm3ScreenFlashFields,
        .hash_fields = 1 },
    { .name = "tm3TireMark",
        .size = sizeof(Tm3TireMark),
        .fields = Tm3TireMarkFields,
        .hash_fields = 1 },
    { .name = "tm3WheelSurface",
        .size = sizeof(Tm3WheelSurface),
        .fields = Tm3WheelSurfaceFields,
        .hash_fields = 1 },
    { .name = "tm3SurfaceParticle",
        .size = sizeof(Tm3SurfaceParticle),
        .fields = Tm3SurfaceParticleFields,
        .hash_fields = 1 },
    { .name = "tm3Transition",
        .size = sizeof(Tm3Transition),
        .fields = Tm3TransitionFields,
        .hash_fields = 1 },
    { .name = "tm3OutlawEmitter",
        .size = sizeof(OutlawEmitter),
        .fields = Tm3EmitterFields,
        .hash_fields = 1 },
    { .name = "tm3OutlawBolt",
        .size = sizeof(OutlawBolt),
        .fields = Tm3BoltFields,
        .hash_fields = 1 },
    { .name = "tm3Remote", .size = sizeof(Tm3Remote), .fields = Tm3RemoteFields, .hash_fields = 1 },
    { .name = "tm3Prop",
        .size = sizeof(Tm3Prop),
        .fields = Tm3PropFields,
        .needs_template = 1,
        .baseline_removable = 1,
        .hash_fields = 1 },
    { .name = "tm3Decoration",
        .size = sizeof(Tm3Decoration),
        .fields = Tm3DecorationFields,
        .needs_template = 1,
        .hash_fields = 1 },
    { .name = "tm3Flamer", .size = sizeof(Emitter), .fields = emitter_fields, .hash_fields = 1 },
    { .name = "tm3Flame", .size = sizeof(Flame), .fields = flame_fields, .hash_fields = 1 },
    { .name = "tm3Burn", .size = sizeof(Burn), .fields = burn_fields, .hash_fields = 1 },
    { .name = "tm3GroundFire", .size = sizeof(Burn), .fields = burn_fields, .hash_fields = 1 },
    { .name = "tm3MapBeam",
        .size = sizeof(Tm3MapBeam),
        .fields = Tm3MapBeamFields,
        .hash_fields = 1 },
    { .name = "tm3RainDrop",
        .size = sizeof(Tm3RainDrop),
        .fields = Tm3RainDropFields,
        .hash_fields = 1 },
    { .name = "tm3Missile",
        .size = sizeof(Tm3Missile),
        .validate = Tm3MissileValidate,
        .fields = Tm3MissileFields,
        .hash_fields = 1 },
    { .name = "tm3Debris", .size = sizeof(Tm3Debris), .fields = Tm3DebrisFields, .hash_fields = 1 },
    { .name = "tm3Sprite", .size = sizeof(Tm3Sprite), .fields = Tm3SpriteFields, .hash_fields = 1 },
    { .name = "tm3Explosion",
        .size = sizeof(Tm3Explosion),
        .fields = Tm3ExplosionFields,
        .hash_fields = 1 },
    { 0 },
};
const SnapshotType* Tm3SnapshotTypes(void)
{
    return snapshot_types;
}
