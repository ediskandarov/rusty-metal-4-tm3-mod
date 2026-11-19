#ifndef TM3_WORLD_H
#define TM3_WORLD_H

#include "tm3/resources.h"
#include "world_weapons.h"

extern const WebWorldWeapons Tm3WorldWeapons;
int Tm3LaunchMapBeam(Car* owner, const SVECTOR* origin, const SVECTOR* direction);
const SVECTOR* Tm3WorldMarker(unsigned kind);

#endif
