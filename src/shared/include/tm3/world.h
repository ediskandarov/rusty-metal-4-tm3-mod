#ifndef TM3_WORLD_H
#define TM3_WORLD_H

#include "tm3/resources.h"
#include "tm4/modules/car_weapon.h"
#include "world_weapons.h"

extern const WebWorldWeapons Tm3WorldWeapons;
s32 Tm3LaunchWorldProjectile(Car*, void*, CarWeaponInstance*, s32);
s32 Tm3LaunchLightning(Car*, void*, CarWeaponInstance*, s32);
int Tm3LaunchMapBeam(Car* owner, const SVECTOR* origin, const SVECTOR* direction);
const SVECTOR* Tm3WorldMarker(unsigned kind);

#endif
