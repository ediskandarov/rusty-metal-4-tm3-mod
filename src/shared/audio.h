#ifndef TM3_SHARED_AUDIO_H
#define TM3_SHARED_AUDIO_H
#include "tm3/resources.h"

void Tm3PlayVoice(
    char* name, const SVECTOR* position, void* owner, s32 pitch, s32 random_pitch, s32 volume);
void Tm3PlaySound(s32 id, const SVECTOR* position, s32 pitch, s32 random_pitch);
#endif
