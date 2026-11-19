#ifndef TM3_MAP_LASER_H
#define TM3_MAP_LASER_H
#include "tm3/missile.h"
#include "tm4/modules/car_weapon.h"
typedef struct {
    Tm3ProjectileFlight flight;
    SVECTOR origin;
    MATRIX pose;
} Tm3MapBeam;
extern const SnapshotField Tm3MapBeamFields[];
int Tm3LaserRegister(RegistryDirectory*);
int Tm3MapLaser(Car*, const SVECTOR* target);
s32 Tm3FireRadar(Car*, void*, CarWeaponInstance*, s32);
#endif
