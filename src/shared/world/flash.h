#ifndef TM3_FLASH_H
#define TM3_FLASH_H
#include <LIBGTE.H>
#include "snapshot_types.h"
#include "tm4/main/registry.h"

typedef struct {
    CVECTOR color;
    s32 lightning, remaining, last_tick;
} Tm3ScreenFlash;
extern const SnapshotField Tm3ScreenFlashFields[];
int Tm3FlashRegister(RegistryDirectory* directory);
#ifdef TM3_TEST_HOOKS
s32 Tm3TestScreenFlash(void);
#endif
#endif
