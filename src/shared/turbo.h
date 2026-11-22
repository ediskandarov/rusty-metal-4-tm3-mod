#ifndef TM3_TURBO_H
#define TM3_TURBO_H
#include "snapshot_types.h"
#include "tm4/main/registry.h"
#include "tm4/modules/sound.h"

typedef struct {
    SVECTOR position;
    s32 sprite, size, fps;
    char sound[64];
    SoundEmitter* loop;
} Tm3Turbo;
int Tm3TurboRegister(RegistryDirectory* directory);
int Tm3TurboValidate(const void* object);
extern const SnapshotField Tm3TurboFields[];
#endif
