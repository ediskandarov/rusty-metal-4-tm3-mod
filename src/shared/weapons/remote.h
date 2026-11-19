#ifndef TM3_REMOTE_H
#define TM3_REMOTE_H
#include "tm3/missile.h"
#include "tm4/modules/car_weapon.h"
extern const SnapshotField Tm3RemoteFields[];
typedef struct {
    s32 slot;
} Tm3Remote;
int Tm3RemoteRegister(RegistryDirectory* directory);
s32 Tm3PlaceRemote(Car*, void*, CarWeaponInstance*, s32);
#endif
