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
    s32 age, angle, frame, range, force, damage;
} OutlawEmitter;

extern const SnapshotField Tm3BoltFields[], Tm3EmitterFields[];
int Tm3LightningRegister(RegistryDirectory* directory);
int Tm3CarLightning(Car* car);
int Tm3MapLightning(unsigned marker);
#endif
