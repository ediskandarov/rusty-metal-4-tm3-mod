#ifndef TM3_DESTRUCTION_H
#define TM3_DESTRUCTION_H
#include "snapshot_fields.h"
#include "tm4/main/object.h"
#include "tm4/main/registry.h"
typedef struct {
    RegistryDirectory* registry;
    s32 hit_points;
    u32 stage;
    Tm4InteractionNode* interactions;
} Tm3Destroyable;
extern u32 Tm3DestroyableSizeof;
extern const SnapshotField Tm3DestroyableFields[];
s32 Tm3DestroyableInstanceConstructor(Tm3Destroyable*, RegistryDirectory*);
void Tm3DestroyableProcess(Tm3Destroyable*);
void Tm3DestroyableDestructor(Tm3Destroyable*);
int Tm3DestroyableValidate(const void*);
void InteractBulletWithTm3Destroyable(void*, void*);
void InteractWeaponProjectileWithTm3Destroyable(void*, void*);
void InteractCarWithTm3Destroyable(void*, void*);
void InteractExplosionShockWaveWithTm3Destroyable(void*, void*);
void InteractWeaponRayBeamWithTm3Destroyable(void*, void*);
#ifdef TM3_TEST_HOOKS
s32 Tm3TestHitSceneryWithEvent(s32 animation);
#endif
#endif
