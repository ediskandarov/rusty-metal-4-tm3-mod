#ifndef TM3_SURFACE_H
#define TM3_SURFACE_H
#include "port/extensions/surface_effects.h"
#include "snapshot_types.h"
#include "tm3/resources.h"

typedef struct {
    SVECTOR edge[4];
    s32 material, first_shade, last_shade;
    u32 sequence, finished;
} Tm3TireMark;
typedef struct {
    Tm3TireMark* active[4];
    u32 finished;
    s32 skid_sample, skid_volume;
    u8 delay[4][3];
} Tm3WheelSurface;
extern const SnapshotField Tm3TireMarkFields[];
int Tm3RegisterTireMarks(RegistryDirectory* directory);
extern const Rm4SurfaceEffects Tm3SurfaceEffects;
void Tm3TrackWheel(Tm3WheelSurface*, int wheel, const Rm4WheelContact*, const u8* row);
void Tm3UpdateSkidSound(Tm3WheelSurface*, Car*, const Rm4WheelContact*);
void Tm3ResetSkidSound(Tm3WheelSurface*, Car*);
typedef struct {
    SVECTOR position, velocity;
    s16 width, height, rise;
    u8 family, material, frame, flip, shade, growing;
    s16 timer;
} Tm3SurfaceParticle;
extern const SnapshotField Tm3WheelSurfaceFields[], Tm3SurfaceParticleFields[];
int Tm3SurfaceRegister(RegistryDirectory* directory);
#endif
