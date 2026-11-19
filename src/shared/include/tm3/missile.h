#ifndef TM3_MISSILE_H
#define TM3_MISSILE_H
#include "snapshot_types.h"
#include "tm3/projectile_motion.h"
#include "tm3/projectile_visual.h"
#include "tm4/main/registry.h"
#include "tm4/modules/car.h"

enum { Tm3FreezeTicks = 90 };
typedef struct Tm3Missile Tm3Missile;
/* Shared prefix of the downloadable missile-car contexts. Weak links track the
   current volley without owning older projectiles or transferring attribution. */
typedef struct {
    Tm3Missile* projectiles[4];
} Tm3MissileOwner;
struct Tm3Missile {
    const Tm3MissileDefinition* definition;
    Tm3ProjectileFlight flight;
    MATRIX transform;
    Tm3MissileTrail trail;
    Car *target, *hit;
    void* world_owner;
    s32 target_serial, hit_serial, world_serial;
    SVECTOR contact;
    u32 hit_distance, linger, world_hit, volley_slot;
    u16 damage, surface_kind;
};
int Tm3MissileValidate(const void* payload);
int Tm3MissilesRegister(RegistryDirectory* directory);
Tm3Missile* Tm3MissileLaunch(Tm3MissileOwner* state, Car* owner, Car* target,
    const MATRIX* transform, s32 rear, const Tm3MissileDefinition* definition, u32 slot, u32 color);
extern const SnapshotField Tm3MissileFields[], Tm3RainDropFields[];
typedef struct {
    Tm3ProjectileFlight flight;
    MATRIX transform;
} Tm3RainDrop;
#endif
