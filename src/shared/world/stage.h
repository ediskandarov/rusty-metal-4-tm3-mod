#ifndef TM3_STAGE_H
#define TM3_STAGE_H
#include "tm3/resources.h"
typedef struct {
    s32 group, stage, tick;
} Tm3StageHide;
void Tm3StageEffect(RegistryDirectory* stage, s32 x, s32 y, s32 z);
void Tm3FragmentImpact(const SVECTOR* point, s32 size, s32 surface);
int Tm3StageRegister(RegistryDirectory* directory);
#endif
