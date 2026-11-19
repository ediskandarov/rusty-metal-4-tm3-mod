#ifndef TM3_EFFECTS_PRIVATE_H
#define TM3_EFFECTS_PRIVATE_H
#include "mod_api.h"
#include "snapshot_types.h"
#include "tm3/resources.h"
#include "tm4/main/object.h"

typedef struct {
    SVECTOR position, step;
    s32 profile, frame, elapsed, period, size;
} Tm3Sprite;
typedef struct {
    s32 height, inner_ratio_q12, speed, duration, radial_force, lift, affects_owner, once_per_car;
    s32 age, radius, slow_speed, damage;
    u32 color, color_step;
    s32 hit_serials[16];
    int16_t rotation[3][3], step[3];
    u32 material_offset;
} Tm3Explosion;
typedef struct {
    s32 position[3], velocity[3], spin, angle;
} Tm3DebrisParticle;
typedef struct {
    Tm3DebrisParticle particles[12];
    u32 floor, size, color;
} Tm3Debris;
typedef char Tm3DebrisSizeCheck[sizeof(Tm3Debris) == 396 ? 1 : -1];

extern const SnapshotField Tm3SpriteFields[], Tm3ExplosionFields[], Tm3DebrisFields[];
int Tm3SpritesRegister(RegistryDirectory* directory);
int Tm3ExplosionsRegister(RegistryDirectory* directory);
int Tm3DebrisRegister(RegistryDirectory* directory);
int Tm3ExplosionInteractionsRegister(void);

static inline s32 q12(s32 product)
{
    return (product + 2048) >> 12;
}
static inline void set_position(void* object, const SVECTOR* p)
{
    ObjectSetPosition(object, p->vx, p->vy, p->vz);
}
#endif
