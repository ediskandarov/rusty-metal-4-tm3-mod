#ifndef TM3_SHARED_RESOURCES_H
#define TM3_SHARED_RESOURCES_H
#include "participant.h"
#include "tm3/body.h"
#include "tm3/projectile_motion.h"
#include "tm3/projectile_visual.h"
#include "tm3/weapon_geometry.h"
#include "tm3/weapon_tuning.h"
#include "tm4/main/card.h"
#include "tm4/main/registry.h"
#include "tm4/modules/car.h"
#include "tm4_scalar.h"

typedef struct {
    SVECTOR position;
    const MATRIX* rotation;
    int16_t step[3];
    enum { Tm3BlastMaterial, Tm3AxelMaterial, Tm3Untextured, Tm3RemoteMaterial } material;
    u32 color;
    s32 height, inner_ratio_q12, speed, duration, radial_force, lift;
    Car* owner;
    WebParticipantId source;
    s32 affects_owner, once_per_car;
} Tm3ExplosionSettings;

typedef struct {
    s32 sample, pitch_base, pitch_gain, volume_base, volume_gain;
} Tm3EngineSettings;

s32 Tm3DamageScenery(void* owner, s32 damage, s32 x, s32 y, s32 z);
int Tm3StartFlamer(Car* car, const SVECTOR* mount);
int Tm3ResourcesAcquire(void);
int Tm3LoadSound(s32 id);
void Tm3PlayNamedSound(
    char* name, const SVECTOR* position, void* owner, s32 pitch, s32 random_pitch);
void Tm3FlashStart(s32 lightning, s32 duration);
void Tm3PlayLaserSound(void* beam);
void Tm3ResourcesRelease(void);
void Tm3SpawnSurfaceSprite(s32 profile, const SVECTOR* position, s32 size, const SVECTOR* velocity,
    s32 fps, s32 sound, s32 surface);
void Tm3SpawnDebris(const SVECTOR* position, s32 size);
void Tm3DrawFire(int frame, int width, int height, const SVECTOR* center, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view);
void Tm3SpawnSprite(
    s32 profile, const SVECTOR* position, s32 size, const SVECTOR* velocity, s32 fps, s32 sound);
void Tm3CarEngineProcess(Car* car, const Tm3EngineSettings* settings);
void Tm3SpawnProjectileSmoke(const int16_t position[3]);
void Tm3SpawnBurstParticles(const SVECTOR* position);
void Tm3SpawnExplosion(const Tm3ExplosionSettings* settings);
void Tm3DisplayCarGroups(Car* car, s32 association, const MATRIX* local_to_world,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view);
s32 Tm3ScreenClip(u_long a, u_long b, u_long c);
void Tm3DisplayWeaponGeometry(const Tm3WeaponGeometry* mesh, u32 descriptor, u32 variant,
    unsigned texture_bank, s32 tint, const MATRIX* local_to_world, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view);
void Tm3DrawMapBeam(
    const SVECTOR*, const s16 end[3], const MATRIX*, Tm4OrderingTag*, u8**, u8*, MATRIX*);
void Tm3DisplayWeaponGroup(u32 descriptor, u32 variant, s32 tint, const MATRIX* local_to_world,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view);
int Tm3SpriteFrameCount(int id);
void Tm3DrawOutlawEmitter(int angle, int frame, const SVECTOR* position, Tm4OrderingTag* ordering,
    u8** cursor, u8* limit, MATRIX* view);
void Tm3DrawOutlawBolt(const MATRIX* transform, const s16 points[][3], int count,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view);
typedef enum { Tm3FreezeVisual, Tm3NapalmVisual, Tm3RainDropVisual } Tm3EnergyVisual;
void Tm3DisplayEnergyMissile(MATRIX* transform, Tm3EnergyVisual visual, unsigned age,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view);
void Tm3DisplayMissileTrail(
    const Tm3MissileTrail* trail, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view);
void Tm3DrawBillboard(int id, int frame, int size, u32 color, const SVECTOR* position,
    Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view);
void Tm3SpawnSmoke(const int16_t position[3], s32 size);
int Tm3WeaponAnimationTexture(u32 header, int frame, Tm4CardQuadTexture* texture);
#endif
