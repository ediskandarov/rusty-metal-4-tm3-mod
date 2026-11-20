#ifndef TM3_WORLD_H
#define TM3_WORLD_H

#include "tm3/resources.h"
#include "tm4/modules/car_weapon.h"

void Tm3WorldWeaponsClassConstructor(RegistryDirectory*);
void Tm3WorldWeaponsClassDestructor(RegistryDirectory*);
s32 Tm3LaunchWorldProjectile(Car*, void*, CarWeaponInstance*, s32);
s32 Tm3LaunchLightning(Car*, void*, CarWeaponInstance*, s32);
int Tm3LaunchMapBeam(Car* owner, const SVECTOR* origin, const SVECTOR* direction);
const SVECTOR* Tm3WorldMarker(unsigned kind);

#endif
