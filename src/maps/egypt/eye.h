#ifndef TM3_EGYPT_EYE_H
#define TM3_EGYPT_EYE_H

#include "snapshot_types.h"
#include "tm3/world.h"

int Tm3EyeRegister(void);
s32 Tm3UseEye(Car*, void*, CarWeaponInstance*, s32);
extern const SnapshotType Tm3EyeSnapshots[];

#endif
