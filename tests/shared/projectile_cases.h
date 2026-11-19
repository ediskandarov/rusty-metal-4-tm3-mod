#ifndef TM3_PROJECTILE_CASES_H
#define TM3_PROJECTILE_CASES_H
#include "tm3/projectile_definition.h"
const Tm3MissileDefinition* test_projectile(int profile);
const Tm3ProjectileTuning* test_tuning(int profile);
const Tm3ProjectilePresentation* test_artwork(int profile);
uint16_t Tm3WarthogDamage(uint32_t age);
#endif
