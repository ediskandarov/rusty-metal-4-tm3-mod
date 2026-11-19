#ifndef TM3_LIGHTNING_H
#define TM3_LIGHTNING_H
#include "snapshot_types.h"
#include "tm3/resources.h"
typedef struct {
    MATRIX transform;
    s16 points[15][3];
    s32 count, phase, target_serial;
} OutlawBolt;
typedef struct {
    MATRIX initial_transform;
    OutlawBolt* bolts[16];
    s32 age, angle, frame, range, force, damage, duration, flash;
} OutlawEmitter;

extern const SnapshotField Tm3BoltFields[], Tm3EmitterFields[];
int Tm3LightningRegister(RegistryDirectory* directory);
typedef struct {
    Car* owner;
    SVECTOR position;
    const MATRIX* transform;
    s32 range, force, damage, duration, flash, pitch;
    char* sound;
} Tm3LightningSettings;
int Tm3SpawnLightning(const Tm3LightningSettings* settings);
int Tm3MapLightning(unsigned marker);
#endif
